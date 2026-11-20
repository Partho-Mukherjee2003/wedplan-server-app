// ============================================================
//  WedPlan Server — index.js
//  Express.js + MongoDB Backend for WedPlan (Assignment 9)
// ============================================================

// ------------------------------------------------------------
//  SECTION 1: IMPORTS
// ------------------------------------------------------------
import express from "express";
import "dotenv/config";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";

// ------------------------------------------------------------
//  SECTION 2: APP + MIDDLEWARE
//  - express.json() : frontend theke asha JSON body porar jonno
//  - cors()         : client (port 3000) theke API call er permission
// ------------------------------------------------------------
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// ------------------------------------------------------------
//  SECTION 3: MONGODB CONNECTION
//  Database: WedPlan
//  Collections: services, bookings, user (Better Auth), transactions
// ------------------------------------------------------------
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

// ------------------------------------------------------------
//  SECTION 4: HELPER FUNCTION
//  Dummy data te _id holo "svc_01" er moto string,
//  real MongoDB te _id holo ObjectId — 2 tai support korlam.
//  Kono document khujte hole ei helper use koro.
// ------------------------------------------------------------
async function findById(collection, id) {
  let doc = await collection.findOne({ _id: id });
  if (!doc && ObjectId.isValid(id)) {
    doc = await collection.findOne({ _id: new ObjectId(id) });
  }
  return doc;
}

// ------------------------------------------------------------
//  SECTION 5: ROOT ROUTE
//  Page: Browser e server khulle ei message dekhabe
// ------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("WedPlan Server is running");
});

// ============================================================
//  SECTION 6: PUBLIC ROUTES
//  Login charai sobai use korte parbe
//  Page: Home (Featured Services), Browse Services, Service Details
// ============================================================

// GET /services
// Page: Browse Services, Home Featured, Admin Manage Services, Vendor My Services
// Query dile filter hobe:
//   /services                 -> sob service (Admin, Vendor er jonno)
//   /services?status=approved -> sudhu approved (Browse er jonno)
//   /services?vendorId=xxx    -> sudhu oi vendor er service
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

// GET /services/:id
// Page: Service Details (/services/[id])
app.get("/services/:id", async (req, res) => {
  try {
    const service = await findById(servicesCollection, req.params.id);

    if (!service) {
      return res.status(404).send({ message: "Service not found" });
    }

    res.send(service);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});

// ============================================================
//  SECTION 7: CUSTOMER ROUTES
//  Page: Service Details (Booking Form), Customer My Bookings
// ============================================================

// POST /bookings
// Page: Service Details er booking form submit hole ekhane ashbe
// Rules:
//   1. Vendor nijer service nije book korte parbe na
//   2. Blocked customer booking korte parbe na
//   3. Sudhu approved service ei booking hobe
//   4. Ekই service, ekই date e duplicate booking hobe na
app.post("/bookings", async (req, res) => {
  try {
    const booking = req.body;

    // Rule 1: Vendor nijer service nije book korte parbe na
    if (booking.vendorId === booking.customerId) {
      return res
        .status(403)
        .send({ message: "You cannot book your own service" });
    }

    // Rule 2: Blocked customer booking korte parbe na
    const customer = await findById(usersCollection, booking.customerId);
    if (customer?.isBlocked) {
      return res.status(403).send({
        message: "Your account is blocked. You cannot make bookings.",
      });
    }

    // Rule 3: Sudhu approved service ei booking hobe
    const service = await findById(servicesCollection, booking.serviceId);
    if (!service) {
      return res.status(404).send({ message: "Service not found" });
    }
    if (service.status !== "approved") {
      return res.status(400).send({
        message: "This service is not available for booking",
      });
    }

    // Rule 4: Duplicate booking check (same service + same date)
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

// ============================================================
//  SECTION 8: BOOKING ROUTES (Customer + Vendor shared)
//  Page: Customer My Bookings, Vendor Booking Requests,
//        Customer/Vendor/Admin Overview (count er jonno)
// ============================================================

// GET /bookings
//   /bookings?customerId=xxx -> Customer er nijer booking (My Bookings)
//   /bookings?vendorId=xxx   -> Vendor er kase asha booking (Booking Requests)
//   /bookings                -> sob booking (Admin Overview count)
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

// PATCH /bookings/:id
// Page: Customer My Bookings (Cancel), Vendor Booking Requests (Accept/Reject)
// Rules:
//   - Sudhu pending booking ei change hobe
//   - Customer sudhu nijer booking cancel korte parbe
//   - Vendor sudhu nijer service er booking accept/reject korte parbe
app.patch("/bookings/:id", async (req, res) => {
  try {
    const { status, customerId, vendorId } = req.body;
    const id = req.params.id;

    // Age booking ta khujo
    const booking = await findById(bookingsCollection, id);
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

    const result = await bookingsCollection.updateOne(
      { _id: booking._id },
      { $set: { status } },
    );
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// ============================================================
//  SECTION 9: VENDOR ROUTES
//  Page: Vendor Add Service, Vendor My Services
// ============================================================

// POST /services
// Page: Vendor Add Service form
// Rules:
//   - Default status: pending (admin approve na kora porjonto public e dekhabe na)
//   - Free vendor: max 3 ta active (approved) service
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

// PATCH /services/:id
// Page: Vendor My Services er Update form
// Rule: Sudhu nijer service update korte parbe
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

// DELETE /services/:id
// Page: Vendor My Services (Delete), Admin Manage Services (Delete)
//   - vendorId query dile: sudhu nijer service delete hobe (Vendor)
//   - vendorId na dile: id diye delete hobe (Admin)
app.delete("/services/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { vendorId } = req.query;

    const query = vendorId ? { _id: id, vendorId } : { _id: id };

    let result = await servicesCollection.deleteOne(query);
    if (result.deletedCount === 0 && ObjectId.isValid(id)) {
      const query2 = vendorId
        ? { _id: new ObjectId(id), vendorId }
        : { _id: new ObjectId(id) };
      result = await servicesCollection.deleteOne(query2);
    }
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// ============================================================
//  SECTION 10: ADMIN ROUTES
//  Page: Admin Manage Users, Admin Manage Services,
//        Admin Transactions, Admin Overview
// ============================================================

// GET /users
// Page: Admin Manage Users, Admin Overview (count),
//       Service Details (vendor info), My Bookings (vendor info),
//       Dashboard Layout (blocked check)
app.get("/users", async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.send(users);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// PATCH /users/:id/block
// Page: Admin Manage Users er Block/Unblock button
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

// PATCH /services/:id/status
// Page: Admin Manage Services er Approve/Reject button
// NOTE: Ei route ta PATCH /services/:id er AGE rakhte hobe,
//       na hole Express /:id route er sathe confuse hobe.
//       (Ekhane Admin section e thakleo Express order onujayi
//        /services/:id/status age match korbe karon eta beshi specific)
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

// GET /transactions
// Page: Admin Transactions, Admin Overview (revenue count)
// Rule: View only — admin manually change korte parbe na
app.get("/transactions", async (req, res) => {
  try {
    const transactions = await transactionsCollection.find().toArray();
    res.send(transactions);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// ============================================================
//  SECTION 11: SERVER START
// ============================================================
app.listen(port, () => {
  console.log(`WedPlan server listening on port ${port}`);
});
