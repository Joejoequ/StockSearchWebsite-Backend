
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const {response} = require("express");
const morgan = require('morgan');
const app = express();
const path = require('path');
app.use(cors());
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
app.use(bodyParser.json());
const FINNHUB_API_KEY="cmrn3p1r01qvmr5qqfc0cmrn3p1r01qvmr5qqfcg";
const POLYGON_API_KEY="XUfQnilwktq9iGD_ith6sPokhYYfqksl";

const { MongoClient, ServerApiVersion} = require('mongodb');
const uri = "mongodb+srv://joejoequ:Qjqqjq2016@cs571a3.37dvivn.mongodb.net/?retryWrites=true&w=majority&appName=CS571A3";
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});



app.use(express.static(path.join(__dirname, 'public/cs571-a3/browser')));


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/cs571-a3/browser','index.html'));
});




function getFormattedDate(date) {
    var year = date.getFullYear();
    var month = (date.getMonth() + 1).toString().padStart(2, '0');
    var day = date.getDate().toString().padStart(2, '0');
    return year + '-' + month + '-' + day;
}

//sell stock
app.post('/api/portfolio/sell', async (req, res) => {
    const { userid, quantity, ticker } = req.body;

    try {
        await client.connect();
        const db = client.db('A3');
        const collection = db.collection('portfolio');

        const user = await collection.findOne({ _id: userid });

        if (!user) {
            res.send({ success:false,message: 'FAIL USER NOT EXISTS' });
            return;
        }

        const stockIndex = user.stocks.findIndex(stock => stock.ticker === ticker);
        if (stockIndex === -1 || user.stocks[stockIndex].quantity < quantity) {
            res.send({ success:false,message: 'FAIL NO ENOUGH STOCK QUANTITY'});
            return;
        }


        const response = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`);
        const price = parseFloat(response.data.c.toFixed(2));
        const gain = quantity * price;


        var orginalQuantity=user.stocks[stockIndex].quantity;
        user.stocks[stockIndex].quantity -= quantity;

        if (user.stocks[stockIndex].quantity === 0) {
            user.stocks.splice(stockIndex, 1);
        }
        else {
            user.stocks[stockIndex].cost = Number((quantity*user.stocks[stockIndex].cost/orginalQuantity).toFixed(2));
        }
        user.balance = Number((user.balance+gain).toFixed(2));



        await collection.updateOne({ _id: userid }, { $set: user });
        res.send({ success: true, user: user });
    } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, message: 'Internal Server Error' });
    } finally {
        await client.close();
    }
});


//userid,quantity,symbol
//buy
app.post('/api/portfolio/buy',  async (req, res) => {


    const { userid, quantity, ticker } = req.body;



    try {

        await client.connect();
        const db = client.db('A3');
        const collection = db.collection('portfolio');


        let user = await collection.findOne({ _id: userid });

        const response = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`);
        const price = parseFloat(response.data.c.toFixed(2));
        const totalCost = quantity * price;

        if (user) {




                if (user.balance < totalCost) {
                    res.send({ success: false, message: 'FAIL INSUFFICIENT BALANCE' });
                    return;
                }


            const stockIndex = user.stocks.findIndex(s => s.ticker === ticker);
            if (stockIndex !== -1) {

                user.stocks[stockIndex].quantity += Number(quantity);
                user.stocks[stockIndex].cost = Number((user.stocks[stockIndex].cost+totalCost).toFixed(2));


            } else {

                user.stocks.push({ ticker, quantity, cost: Number(totalCost.toFixed(2) )});
            }
            console.log("prev",user.balance,totalCost);
            user.balance =Number((user.balance-totalCost).toFixed(2));
            console.log("after",user.balance);


            await collection.updateOne({ _id: userid }, { $set: user });


        } else {
            if (25000 < totalCost) {
                res.send({ success: false,  message: 'FAIL INSUFFICIENT BALANCE' });
                return;

            }

            user = {
        _id: userid,
                stocks: [{ ticker, quantity, cost: totalCost }],
                balance: Number((25000-totalCost).toFixed(2))
            };


            await collection.insertOne(user);
        }

        res.send({ success: true, user: user });
    } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, message: 'Internal Server Error' });
    } finally {
        await client.close();
    }


});





app.get('/api/portfolio', async (req, res) => {
    const { userid } = req.query;

    try {

        await client.connect();
        const db = client.db('A3');
        const collection = db.collection('portfolio');


        const user = await collection.findOne({ _id: userid });

        if (user) {
            const stocksWithPrice = await Promise.all(user.stocks.map(async (stock) => {
            const response = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${stock.ticker}&token=${FINNHUB_API_KEY}`);
            const price = parseFloat(response.data.c.toFixed(2));


                const profileResponse = await axios.get(`https://finnhub.io/api/v1/stock/profile2?symbol=${stock.ticker}&token=${FINNHUB_API_KEY}`);
                const name = profileResponse.data.name;



                return { ...stock, price ,name};
        }));

            res.send({


                    balance: user.balance,
                    stocks: stocksWithPrice

            });
        } else {


            const newuser = {
                _id: userid,
                stocks: [],
                balance: 25000
            };

            await collection.insertOne(newuser);

            res.send({

                    balance: newuser.balance,
                    stocks: newuser.stocks

            });

        }
    } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, message: 'Internal Server Error' });
    } finally {
        await client.close();
    }
});



//userid,symbol
app.post('/api/watchlist',  async (req, res) => {


    const { userid, stockSymbol } = req.body;

    try{
    await client.connect();


    const db = client.db('A3');
    const collection = db.collection('watchlist');


        const result = await collection.findOneAndUpdate(
            { _id: userid},
            { $addToSet: { stocks: stockSymbol } },
            { upsert: true }
        );


            res.status(200).json({ message: 'SUCCESS' });


    } catch (error) {
        console.error('Database:', error);
        res.status(500).json({ error: 'FAIL' });
    } finally {

        await client.close();
    }

});


//userid , ticker, return t/f
app.get('/api/watchlist/ifStockInWatchlist', async (req, res) => {
    const userid = req.query.userid;
    const symbol = req.query.symbol;



    try{
        await client.connect();


        const db = client.db('A3');
        const collection = db.collection('watchlist');


        const user = await collection.findOne({ _id: userid });


        if (!user) {
           res.send( false);
        }
        else{
            res.send( user.stocks.includes(symbol));
                    }


    } catch (error) {
        console.error('Database:', error);
        res.status(500).send('Database Error'+error);
    } finally {

        await client.close();
    }

});





//userid return a symbol list
app.get('/api/watchlist', async (req, res) => {
    const userid = req.query.userid;



    try{
        await client.connect();


        const db = client.db('A3');
        const collection = db.collection('watchlist');


        const user = await collection.findOne({ _id: userid });


        if (!user) {
            res.json([]);
        }
        else{



            const stockData = await Promise.all(user.stocks.map(async (ticker) => {
                const profileResponse = await axios.get(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_API_KEY}`);
                const quoteResponse = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`);

                return {
                    ticker: ticker,
                    name: profileResponse.data.name,
                    currentPrice: quoteResponse.data.c,
                    priceChange: quoteResponse.data.d,
                    percentChange: quoteResponse.data.dp
                };
            }));

            res.json(stockData);


        }


    } catch (error) {
        console.error('Database:', error);
        res.status(500).send('Database Error'+error);
    } finally {

        await client.close();
    }

});



app.delete('/api/watchlist/:userid/:stockSymbol', async (req, res) => {
    const userid = req.params.userid;
    const  stockSymbol  =req.params.stockSymbol;




    try{
        await client.connect();


        const db = client.db('A3');
        const collection = db.collection('watchlist');


        const result = await collection.updateOne(
            { _id: userid },
            { $pull: { stocks: stockSymbol } }
        );

        res.status(200).json({ message: 'SUCCESS' });



    } catch (error) {
        console.error('Database:', error);
        res.status(500).json({ error: 'FAIL' });
    } finally {

        await client.close();
    }

});




app.get('/api/autocomplete',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();

    var url = `https://finnhub.io/api/v1/search?q=${symbol}&token=${FINNHUB_API_KEY}`;




    console.log("----FETCH DATA: "+url);
    axios.get(url)
        .then(response => {


            const filteredResult = response.data.result.filter(item => {
                return item.type === 'Common Stock' && !item.symbol.includes('.');
            });
            res.json(filteredResult);
        })
        .catch(error => {
            console.log(error);
            res.status(500).send('Error in Finnhub API');
        });


});

app.get('/api/profile',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();

    var url = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`;

    console.log("----FETCH DATA: "+url);
    axios.get(url)
        .then(response => {



            res.json(response.data);
        })
        .catch(error => {
            console.log(error);
            res.status(500).send('Error in Finnhub API');
        });


});


app.get('/api/recommendation',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();

    var url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${FINNHUB_API_KEY}`;

    console.log("----FETCH DATA: "+url);
    axios.get(url)
        .then(response => {



            res.json(response.data);
        })
        .catch(error => {
            console.log(error);
            res.status(500).send('Error in Finnhub API');
        });


});

app.get('/api/earnings',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();

    var url = `https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${FINNHUB_API_KEY}`;

    console.log("----FETCH DATA: "+url);
    axios.get(url)
        .then(response => {



            res.json(response.data);
        })
        .catch(error => {
            console.log(error);
            res.status(500).send('Error in Finnhub API');
        });


});


app.get('/api/insider',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();

    var url = `https://finnhub.io/api/v1/stock/insider-sentiment?symbol=${symbol}&from=2022-01-01&token=${FINNHUB_API_KEY}`;

    console.log("----FETCH DATA: "+url);
    axios.get(url)
        .then(response => {

            var result = response.data.data.map(item => {
                return {
                    ...item,
                    actual: item.actual === null ? 0 : item.actual
                };
            });


            res.json(result);
        })
        .catch(error => {
            console.log(error);
            res.status(500).send('Error in Finnhub API');
        });


});


app.get('/api/peers',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();

    var url = `https://finnhub.io/api/v1/stock/peers?symbol=${symbol}&token=${FINNHUB_API_KEY}`;

    console.log("----FETCH DATA: "+url);
    axios.get(url)
        .then(response => {




            res.json( Array.from(new Set(response.data))
                .filter(str => !str.includes('.')));
        })
        .catch(error => {
            console.log(error);
            res.status(500).send('Error in Finnhub API');
        });


});


function isTrading(lastTradingTime){
    var lastTrading=new Date(lastTradingTime+300*1000);
    var current=new Date();

    return current<=lastTrading;
}


app.get('/api/yearStockPrice',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();

    var current=new Date();
    var  twoYearsAgo = new Date(current);

    var TO_PARAM=getFormattedDate(current);


    twoYearsAgo.setFullYear(current.getFullYear() - 2);



            var FROM_PARAM=getFormattedDate(twoYearsAgo);
            var url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${FROM_PARAM}/${TO_PARAM}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
            console.log("----FETCH DATA: "+url);
            axios.get(url)
                .then(response => {




                    res.json(response.data.results);
                })
                .catch(error => {
                    console.log(error);
                    res.status(500).send('Error in Finnhub API');
                });

        });









app.get('/api/hourStockPrice',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();




    var statusCheckUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;


    axios.get(statusCheckUrl)
        .then(response => {

            var currDate;
            if (isTrading(response.data.t)){
                currDate=new Date();
            }
            else {
                currDate=new Date(response.data.t*1000);console.log(response.data.t);
            }




            var TO_PARAM=getFormattedDate(currDate);
            currDate.setDate(currDate.getDate() - 1);

            var FROM_PARAM=getFormattedDate(currDate);
            var url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/hour/${FROM_PARAM}/${TO_PARAM}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
            console.log("----FETCH DATA: "+url);
            axios.get(url)
                .then(response => {



                    var results = response.data.results.map(function(result) {
                        return { c: result.c, t: result.t };
                    });

                    res.json(results);
                })
                .catch(error => {
                    console.log(error);
                    res.status(500).send('Error in Finnhub API');
                });

        });







});

app.get('/api/quote',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();

    var url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;

    console.log("----FETCH DATA: "+url);
    axios.get(url)
        .then(response => {



            res.json(response.data);
        })
        .catch(error => {
            console.log(error);
            res.status(500).send('Error in Finnhub API');
        });


});

//1 week,20card,check empty
app.get('/api/news',  (req, res) => {
    const symbol = req.query.symbol.toUpperCase();


    var currentDate = new Date();
    var oneWeekAgoDate = getFormattedDate(new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000));
    currentDate=getFormattedDate(currentDate);
    var url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${oneWeekAgoDate}&to=${currentDate}&token=${FINNHUB_API_KEY}`;

    console.log("----FETCH DATA: "+url);
    axios.get(url)
        .then(response => {

            filteredData=response.data.filter(function(item) {
                return item.headline && item.image;
            }).slice(0, 20);
            res.json(filteredData);
        })
        .catch(error => {
            console.log(error);
            res.status(500).send('Error in Finnhub API');
        });


});




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
});
