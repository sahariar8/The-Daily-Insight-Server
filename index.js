import express from 'express';
import cors from 'cors';
import 'dotenv/config'
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';
import jwt from 'jsonwebtoken';

import Stripe from 'stripe';
const sk = process.env.STRIPE_SECRET_KEY;
const stripeInstance = Stripe(sk);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kzarlhv.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

    const userCollection = client.db('dailyInsightDB').collection('users');
    const newsCollection = client.db('dailyInsightDB').collection('newses');
    const publisherCollection = client.db('dailyInsightDB').collection('publishers');
    const paymentCollection = client.db('dailyInsightDB').collection('payments');

async function run() {
  try {

    app.post('/jwt',async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{ expiresIn:'1h' });
      res.send({token});
    })

    const verifyToken = async(req,res,next)=>{
      console.log("from verify token",req.headers.authorization);
      if(!req.headers.authorization){
        return res.status(401).send({message:"unauthorized access"})
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded)=>{
          if(err){
            return res.status(401).send({message:"unauthorized access"})
          }
          req.decoded = decoded;
          next();
      })

    }

    const verifyAdmin = async(req,res,next) =>{
          const email = req.decoded.email;
          const query = { email: email };
          const user = await userCollection.findOne(query);
          const isAdmin = user?.role === 'admin';
          if(!isAdmin){
            return res.status(403).send({message : 'foebidden access'})
          }
          next();
    }

    //users route

    app.post('/users',async(req,res)=>{
        const user = req.body;
        const query = {email:user.email};
        const existingUser = await userCollection.findOne(query);
        if(existingUser){
          return res.send({ message:"User Already Exist",InsertedId:null })
        }
        console.log(user);
        const result = await userCollection.insertOne(user);
        res.send(result);
    })


    //verifyADMIN,VERIFYTOKEN
    app.get('/users', verifyToken,async(req,res)=>{
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.delete('/users/:id',async(req,res)=>{
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);

    })

    app.put('/users/:email',async(req,res)=>{
      const email = req.params.email;
      const newEmail = { email : email }
      const getEmail = await userCollection.findOne(newEmail)
      if(getEmail){
      const user = req.body;
      const updatedDoc = {
          $set :{
            name:user.name,
            email:user.email,
            image:user.image,
          }
      }
      const result = await userCollection.updateOne(newEmail,updatedDoc);
      res.send(result);
     }

    })

    app.patch('/users/admin/:id',verifyToken,verifyToken,async(req,res)=>{
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const updatedDoc = {
        $set :{
          role:'admin'
        }
      }
      const result = await userCollection.updateOne(query,updatedDoc);
      res.send(result);
    })

    app.get('/users/admin/:email',verifyToken,async(req,res)=>{
        const email = req.params.email;
        if(email !== req.decoded.email){
          return res.status(403).send({message:'FORBIDDEN ACCESS'})
        }
        const query = { email:email };
        const user = await userCollection.findOne(query);
        let admin = false;
        if(user){
          admin = user?.role === 'admin'
        }
        res.send({admin})
    })

    app.get('/admin/stats',async(req,res)=>{
      const totalUser = await userCollection.estimatedDocumentCount();
     
      res.send({totalUser});
    })

    //publisher

    app.post('/publishers',verifyToken,verifyAdmin,async(req,res)=>{
      const publisher = req.body;
      const result = await publisherCollection.insertOne(publisher);
      res.send(result);
    })

    app.get('/publishers',async(req,res)=>{
      const result = await publisherCollection.find().toArray();
      res.send(result);
    })

    app.post('/news',verifyToken,async(req,res)=>{
      const news = req.body;
      const result = await newsCollection.insertOne(news);
      res.send(result);

    })

    app.get('/newscount',async(req,res)=>{
      const count = await newsCollection.estimatedDocumentCount();
      res.send({ count });
    })

    app.get('/news',async(req,res)=>{
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      console.log(page,size);
      const result = await newsCollection.find().skip(page * size).limit(size).toArray();
      res.send(result);
    })

    app.get('/allnews/:id',async(req,res)=>{

        const id = req.params.id;
        const query = { _id : new ObjectId(id) };
        const result = await newsCollection.findOne(query);
        res.send(result);
    })

    app.get('/all-articles',async(req,res)=>{
    
      let objQuery = {};
      const tags = req.query.tags;
      if(tags){
        objQuery.tags = tags;
      }

      const result = await newsCollection.find(objQuery).sort({ viewCount: -1}).toArray();
      res.send(result);
    })

    app.get('/news/:email',async(req,res)=>{
        const email = req.params.email;
        const query = { email:email };
        const result = await newsCollection.find(query).toArray();
        res.send(result);
    })

    app.delete('/news/:id',async(req,res)=>{
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const result = await newsCollection.deleteOne(query);
      res.send(result);
    })

    //viewCount

    app.patch('/views/:id',async(req,res)=>{
        const id = req.params.id;
        const query = { _id : new ObjectId(id) }
        const update = { $inc: { viewCount: 1 } };
        try {
          const result = await newsCollection.updateOne(query, update);
          console.log("line number", result);
          res.send(result);
      } catch (error) {
          console.error('Error updating news item:', error);
          res.status(500).json({ error: 'Internal Server Error' });
      }

    })

    //dashboard all news delete

    app.delete('/allnews/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const result = await newsCollection.deleteOne(query);
      res.send(result);
    })

    app.patch('/news/premium/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const updatedDoc ={
        $set :{
          premium :"Yes"
        }
      }
      const result = await newsCollection.updateOne(query,updatedDoc);
      res.send(result);
    })


    app.patch('/news/approve/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const updatedDoc ={
        $set :{
         status :"Published",
        
        }
      }
      const result = await newsCollection.updateOne(query,updatedDoc);
      res.send(result);
    })


    app.patch('/news/decline/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const updatedDoc ={
        $set :{
         status :"Decline",
         premium : "No"
        }
      }
      const result = await newsCollection.updateOne(query,updatedDoc);
      res.send(result);
    })


    //dashboard end

    app.get('/mynews/:id',verifyToken, async(req,res)=>{
      const id = req.params.id;
      const news = { _id : new ObjectId(id) };
      const result = await newsCollection.findOne(news);
      res.send(result);
    })

    app.put('/news/:id',verifyToken,async(req,res)=>{
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const news = req.body;
      const updatedDoc = {
        $set :{
            title:news.title,
            tags:news.tags,
            publisher:news.publisher,
            description:news.description,
            image:news.image,
        }
      }
      const result = await newsCollection.updateOne(query,updatedDoc);
      res.send(result);
    })

    //payment

    app.post('/create-payment-intent',verifyToken, async (req,res)=>{
      const {price} = req.body;
      console.log(price)
      const amount = parseInt(price * 100);
      console.log('amount inside the intent',amount)
      const paymentIntent = await stripeInstance.paymentIntents.create({
          amount:amount,
          currency:'usd',
          payment_method_types:['card']
      });

      res.send({
        clientSecret:paymentIntent.client_secret
      })
    })

    //payment details
    app.post('/payment',async(req,res)=>{
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result); 
    })

  //update user status
  app.patch('/users/:id',async(req,res)=>{
    const id = req.params.id;
    const status = req.body.status;
    const query = { _id : new ObjectId(id)};
    const updatedDoc ={
      $set:{
          // subscription:'yes'
          subscription:status
      }
    }
    const result = await userCollection.updateOne(query,updatedDoc);
    res.send(result);
  })


    //
    
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/',async(req,res)=>{
    res.send('Daily Insight Connected');
})

app.listen(port,()=>{
    console.log(`i am from ${port}`)
})