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
import Stripe from "stripe";
import { createRemoteJWKSet, jwtVerify } from "jose";

// ------------------------------------------------------------
//  SECTION 2: APP + MIDDLEWARE
//  - express.json() : frontend theke asha JSON body porar jonno
//                     (verify diye rawBody o rakha hoy — Stripe
//                      webhook signature check er jonno lagbe)
//  - cors()         : client (port 3000) theke API call er permission
// ------------------------------------------------------------
const app = express();
const port = process.env.PORT || 5000;

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
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

// Ekই Stripe session diye 2 bar transaction hobe na (unique index)
try {
  await transactionsCollection.createIndex(
    { stripeSessionId: 1 },
    { unique: true, sparse: true },
  );
} catch (err) {
  console.log("Unique index error:", err.message);
}

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
//  SECTION 4B: JWT SECURITY MIDDLEWARE
//  PDF rule: JWT verification + role check server ei hobe.
//  Client er pathano user ID / role bisshash kora hobe na —
//  user ke token theke niye DB theke role check kora hoy.
//  Token na thakle/vul hole 401, role na mille 403.
// ------------------------------------------------------------
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const JWKS = createRemoteJWKSet(new URL(`${CLIENT_URL}/api/auth/jwks`));

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized. Please sign in." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: CLIENT_URL,
      audience: CLIENT_URL,
    });

    const user = await findById(usersCollection, payload.sub);
    if (!user) {
      return res.status(401).send({ message: "User not found." });
    }
    if (user.isBlocked) {
      return res.status(403).send({ message: "Your account is blocked." });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).send({ message: "Invalid or expired token." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .send({ message: "Forbidden. You do not have access." });
    }
    next();
  };
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
//   1. Sudhu customer booking korte parbe (JWT role check)
//   2. Vendor nijer service nije book korte parbe na
//   3. Blocked customer booking korte parbe na (middleware tei check)
//   4. Sudhu approved service ei booking hobe
//   5. Ekই service, ekই date e duplicate booking hobe na
app.post(
  "/bookings",
  verifyToken,
  requireRole("customer"),
  async (req, res) => {
    try {
      const booking = req.body;

      // Customer ID token theke (client er pathano ID bisshash na)
      booking.customerId = String(req.user._id);

      // Rule 4 age: Sudhu approved service ei booking hobe
      const service = await findById(servicesCollection, booking.serviceId);
      if (!service) {
        return res.status(404).send({ message: "Service not found" });
      }
      if (service.status !== "approved") {
        return res.status(400).send({
          message: "This service is not available for booking",
        });
      }

      // Vendor ID service theke (client er pathano ID bisshash na)
      booking.vendorId = service.vendorId;

      // Rule 2: Vendor nijer service nije book korte parbe na
      if (booking.vendorId === booking.customerId) {
        return res
          .status(403)
          .send({ message: "You cannot book your own service" });
      }

      // Rule 5: Duplicate booking check (same service + same date)
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
  },
);

// ============================================================
//  SECTION 8: BOOKING ROUTES (Customer + Vendor shared)
//  Page: Customer My Bookings, Vendor Booking Requests,
//        Customer/Vendor/Admin Overview (count er jonno)
// ============================================================

// GET /bookings
//   /bookings?customerId=xxx -> Customer er nijer booking (My Bookings)
//   /bookings?vendorId=xxx   -> Vendor er kase asha booking (Booking Requests)
//   /bookings                -> sob booking (Admin Overview count)
app.get("/bookings", verifyToken, async (req, res) => {
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
//   - Customer sudhu nijer booking cancel korte parbe (token er ID diye check)
//   - Vendor sudhu nijer service er booking accept/reject korte parbe
app.patch("/bookings/:id", verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id;
    const userId = String(req.user._id);

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
    if (status === "cancelled" && booking.customerId !== userId) {
      return res.status(403).send({
        message: "You cannot cancel another customer's booking",
      });
    }

    // Vendor accept/reject korle - sudhu nijer service er booking
    if (
      (status === "accepted" || status === "rejected") &&
      booking.vendorId !== userId
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
//   - Sudhu vendor service add korte parbe (JWT role check)
//   - Default status: pending (admin approve na kora porjonto public e dekhabe na)
//   - Free vendor: max 3 ta active (approved) service
app.post("/services", verifyToken, requireRole("vendor"), async (req, res) => {
  try {
    const service = req.body;

    // Vendor ID + plan token/DB theke (client er pathano value bisshash na)
    const vendorId = String(req.user._id);
    const subscriptionPlan = req.user.subscriptionPlan || "free";

    // Free vendor hole 3 tar beshi active (approved) service parbe na
    if (subscriptionPlan === "free") {
      const activeCount = await servicesCollection.countDocuments({
        vendorId,
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
      vendorId,
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
// Rule: Sudhu nijer service update korte parbe (token er ID diye check)
app.patch(
  "/services/:id",
  verifyToken,
  requireRole("vendor"),
  async (req, res) => {
    try {
      const id = req.params.id;
      const { vendorId: _ignored, ...updateData } = req.body;
      if (updateData.price) updateData.price = Number(updateData.price);
      const vendorId = String(req.user._id);

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
  },
);

// DELETE /services/:id
// Page: Vendor My Services (Delete), Admin Manage Services (Delete)
//   - Vendor hole: sudhu nijer service delete hobe
//   - Admin hole: id diye delete hobe
app.delete(
  "/services/:id",
  verifyToken,
  requireRole("vendor", "admin"),
  async (req, res) => {
    try {
      const id = req.params.id;
      const isAdmin = req.user.role === "admin";
      const vendorId = String(req.user._id);

      const query = isAdmin ? { _id: id } : { _id: id, vendorId };

      let result = await servicesCollection.deleteOne(query);
      if (result.deletedCount === 0 && ObjectId.isValid(id)) {
        const query2 = isAdmin
          ? { _id: new ObjectId(id) }
          : { _id: new ObjectId(id), vendorId };
        result = await servicesCollection.deleteOne(query2);
      }
      res.send(result);
    } catch (err) {
      res.status(500).send({ message: "Server error" });
    }
  },
);

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
app.patch(
  "/users/:id/block",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
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
  },
);

// PATCH /services/:id/status
// Page: Admin Manage Services er Approve/Reject button
app.patch(
  "/services/:id/status",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
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
  },
);

// GET /transactions
// Page: Admin Transactions, Admin Overview (revenue count)
// Rule: View only — admin manually change korte parbe na
app.get(
  "/transactions",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const transactions = await transactionsCollection.find().toArray();
      res.send(transactions);
    } catch (err) {
      res.status(500).send({ message: "Server error" });
    }
  },
);

// ============================================================
//  SECTION 10B: STRIPE PAYMENT ROUTES
//  Page: Vendor Subscription page (Upgrade to Premium button)
// ============================================================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /create-checkout-session
// Vendor "Upgrade to Premium" button e click korle Stripe er
// payment page er link baniye dey (৳4,999, 30 diner Premium)
app.post(
  "/create-checkout-session",
  verifyToken,
  requireRole("vendor"),
  async (req, res) => {
    try {
      const { vendorEmail } = req.body;

      // Vendor token/DB theke (client er pathano ID bisshash na)
      const vendor = req.user;
      const vendorId = String(vendor._id);

      if (vendor.subscriptionPlan === "premium") {
        return res
          .status(400)
          .send({ message: "You already have the Premium plan." });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: vendorEmail || vendor.email,
        line_items: [
          {
            price_data: {
              currency: "bdt",
              product_data: {
                name: "WedPlan Premium Vendor Plan",
                description:
                  "Premium plan for 30 days: unlimited services and premium badge.",
              },
              unit_amount: 499900, // ৳4,999 (paisa te)
            },
            quantity: 1,
          },
        ],
        metadata: { vendorId },
        success_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/payment/success`,
        cancel_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/payment/cancel`,
      });

      res.send({ url: session.url });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "Could not start payment." });
    }
  },
);

// POST /webhook
// Payment shesh hole Stripe nijei ei route e khobor pathay.
// PDF rule: Premium sudhu ekhanei hobe (verified webhook),
// success page theke na.
app.post("/webhook", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.log("Webhook signature failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const vendorId = session.metadata?.vendorId;

    if (vendorId) {
      // 1. Age transaction insert koro (unique index duplicate atkabe)
      try {
        await transactionsCollection.insertOne({
          vendorId,
          plan: "premium",
          amount: 4999,
          currency: "bdt",
          stripeSessionId: session.id,
          stripeSubscriptionId: session.subscription || null,
          status: "succeeded",
          createdAt: new Date(),
        });
      } catch (err) {
        // Duplicate key (11000) mane ei session agei process hoyeche
        if (err.code === 11000) {
          return res.send({ received: true });
        }
        throw err;
      }

      // 2. Ebar Vendor ke Premium koro
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const vendor = await findById(usersCollection, vendorId);
      if (vendor) {
        await usersCollection.updateOne(
          { _id: vendor._id },
          {
            $set: {
              subscriptionPlan: "premium",
              subscriptionExpiresAt: expiresAt,
            },
          },
        );
      }
    }
  }

  res.send({ received: true });
});

// ============================================================
//  SECTION 11: SERVER START
//  Local e cholle listen korbe, Vercel e export hobe
// ============================================================
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`WedPlan server listening on port ${port}`);
  });
}

export default app;
