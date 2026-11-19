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
const usersCollection = dataBase.collection("user"); // Better Auth er collection er naam "user"
const transactionsCollection = dataBase.collection("transactions");

//*******************    Middleware
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("WedPlan Server is running");
});

// *** Service API ***
// Ekhon sob service ashbe. Query dile filter hobe:
// /services              -> sob service (Admin, Vendor er jonno)
// /services?status=approved -> sudhu approved (Browse er jonno chaile)
// /services?vendorId=xxx    -> sudhu oi vendor er service
app.get("/services", async (req, res) => {
  try {
    const { status, vendorId } = req.query;
    const query = {};
    if (status) query.status = status;
    if (vendorId) query.vendorId = vendorId;

    const services = await servicesCollection.find(query).toArray();
    res.send(services);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
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

// *** Customer er nijer booking / Vendor er kase asha booking ***
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

// *** Booking Accept / Reject / Cancel ***
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

// *** Service Approve / Reject - Admin er jonno ***
// NOTE: Ei route ta PATCH /services/:id er AGE rakhlam, jeno Express confuse na hoy
app.patch("/services/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id;

    let result = await servicesCollection.updateOne(
      { _id: id },
      { $set: { status } },
    );
    if (result.matchedCount === 0 && ObjectId.isValid(id)) {
      result = await servicesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } },
      );
    }
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
      { $set: updateData },
    );
    if (result.matchedCount === 0 && ObjectId.isValid(id)) {
      result = await servicesCollection.updateOne(
        { _id: new ObjectId(id), vendorId },
        { $set: updateData },
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

// *** Admin Functions ***

// Sob user ana - Admin er jonno
app.get("/users", async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.send(users);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// *** User Block / Unblock ***
app.patch("/users/:id/block", async (req, res) => {
  try {
    const { isBlocked } = req.body;
    const id = req.params.id;

    let result = await usersCollection.updateOne(
      { _id: id },
      { $set: { isBlocked } },
    );
    if (result.matchedCount === 0 && ObjectId.isValid(id)) {
      result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isBlocked } },
      );
    }
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// *** Transaction Functions ***
// Sob transaction ana - Admin er jonno
app.get("/transactions", async (req, res) => {
  try {
    const transactions = await transactionsCollection.find().toArray();
    res.send(transactions);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

//*** Customer Functions ***
// *** Booking Accept / Reject / Cancel ***
app.patch("/bookings/:id", async (req, res) => {
  try {
    const { status, customerId, vendorId } = req.body;
    const id = req.params.id;

    // Age booking ta khujo
    let booking = await bookingsCollection.findOne({ _id: id });
    if (!booking && ObjectId.isValid(id)) {
      booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
    }
    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    // Sudhu pending booking ei change hobe
    if (booking.status !== "pending") {
      return res.status(400).send({
        message: "This booking has already been processed",
      });
    }

    // Customer cancel korle - sudhu nijer booking
    if (status === "cancelled" && booking.customerId !== customerId) {
      return res.status(403).send({
        message: "You cannot cancel another customer's booking",
      });
    }

    // Vendor accept/reject korle - sudhu nijer service er booking
    if (
      (status === "accepted" || status === "rejected") &&
      booking.vendorId !== vendorId
    ) {
      return res.status(403).send({
        message: "You cannot modify another vendor's booking",
      });
    }

    let result = await bookingsCollection.updateOne(
      { _id: booking._id },
      { $set: { status } }
    );
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});



app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
