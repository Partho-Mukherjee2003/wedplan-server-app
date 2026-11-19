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
const bookingsCollection = dataBase.collection("bookings");


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

// *** Booking API ***
app.post("/bookings", async (req, res) => {
  try {
    const booking = req.body;
    // booking = { serviceId, vendorId, customerId, eventDate, eventLocation, message }

    // Rule 1: Vendor nijer service nije book korte parbe na
    if (booking.vendorId === booking.customerId) {
      return res
        .status(403)
        .send({ message: "You cannot book your own service" });
    }

    // Rule 2: Ekই service, ekই date e duplicate booking hobe na
    const existing = await bookingsCollection.findOne({
      serviceId: booking.serviceId,
      customerId: booking.customerId,
      eventDate: booking.eventDate,
      status: { $in: ["pending", "accepted"] },
    });

    if (existing) {
      return res
        .status(400)
        .send({ message: "You already booked this service for this date" });
    }

    // Default status Pending, ar createdAt add kore save koro
    const newBooking = {
      ...booking,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const result = await bookingsCollection.insertOne(newBooking);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});

// ***  Customer er nijer booking / Vendor er kase asha booking  ***
app.get("/bookings", async (req, res) => {
  try {
    const { customerId, vendorId } = req.query;
    const query = {};
    if (customerId) query.customerId = customerId;
    if (vendorId) query.vendorId = vendorId;

    const bookings = await bookingsCollection.find(query).toArray();
    res.send(bookings);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// ***  Booking Accept / Reject / Cancel  ***
app.patch("/bookings/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id;

    let result = await bookingsCollection.updateOne(
      { _id: id },
      { $set: { status } },
    );

    if (result.matchedCount === 0 && ObjectId.isValid(id)) {
      result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } },
      );
    }

    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});


// *** Add Service - default Pending ***
app.post("/services", async (req, res) => {
  try {
    const service = req.body;

    // Free vendor hole 3 tar beshi active (approved) service parbe na
    if (service.subscriptionPlan === "free") {
      const activeCount = await servicesCollection.countDocuments({
        vendorId: service.vendorId,
        status: "approved",
      });
      if (activeCount >= 3) {
        return res.status(403).send({
          message:
            "Free plan limit reached. Upgrade to Premium for unlimited services.",
        });
      }
    }

    const newService = {
      vendorId: service.vendorId,
      serviceName: service.serviceName,
      category: service.category,
      description: service.description,
      price: Number(service.price),
      location: service.location,
      images: service.images,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const result = await servicesCollection.insertOne(newService);
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// *** Update Service - sudhu nijer service ***
app.patch("/services/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { vendorId, ...updateData } = req.body;
    if (updateData.price) updateData.price = Number(updateData.price);

    let result = await servicesCollection.updateOne(
      { _id: id, vendorId },
      { $set: updateData }
    );
    if (result.matchedCount === 0 && ObjectId.isValid(id)) {
      result = await servicesCollection.updateOne(
        { _id: new ObjectId(id), vendorId },
        { $set: updateData }
      );
    }
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// *** Delete Service - sudhu nijer service ***
app.delete("/services/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { vendorId } = req.query;

    let result = await servicesCollection.deleteOne({ _id: id, vendorId });
    if (result.deletedCount === 0 && ObjectId.isValid(id)) {
      result = await servicesCollection.deleteOne({
        _id: new ObjectId(id),
        vendorId,
      });
    }
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});





app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
