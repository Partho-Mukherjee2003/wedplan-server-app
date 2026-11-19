import express from "express";
import "dotenv/config";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const port = process.env.PORT || 5000;


// ******** MongoDB *******
const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const DB = await connectToMongoDB();
const dataBase = DB.db("WedPlan");
const servicesCollection = dataBase.collection("services");



//*******************    Middleware
app.use(express.json())
app.use(cors())



app.get('/', (req,res)=>{
  res.send("WedPlan Server is running")
})
// *** Service API ***
app.get("/services", async (req, res) => {
  const services = await servicesCollection
    .find({ status: "approved" })
    .toArray();
  res.send(services);
});





app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
