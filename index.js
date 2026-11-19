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

// *** Single Service API ***
app.get("/services/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Dummy data te _id holo "svc_01" er moto string,
    // real MongoDB te _id holo ObjectId — 2 tai support korlam
    let service = await servicesCollection.findOne({ _id: id });

    if (!service && ObjectId.isValid(id)) {
      service = await servicesCollection.findOne({ _id: new ObjectId(id) });
    }

    if (!service) {
      return res.status(404).send({ message: "Service not found" });
    }

    res.send(service);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});





app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
