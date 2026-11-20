<!-- ============================================ -->
<!--   💍 WedPlan — Wedding Planning Platform 💍   -->
<!-- ============================================ -->

<div align="center">

# 💍 WedPlan — Wedding Planning Platform (Server)

### Backend API for the WedPlan Wedding Planning Platform ✨

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?style=for-the-badge&logo=stripe&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=for-the-badge&logo=vercel&logoColor=white)

<br/>

[![Live Server](https://img.shields.io/badge/🌐_Live_Server-wedplan--server--henna.vercel.app-C75B5B?style=for-the-badge)](https://wedplan-server-henna.vercel.app)
[![Live Site](https://img.shields.io/badge/💍_Live_Site-wedplan--client--app.vercel.app-C9A86A?style=for-the-badge)](https://wedplan-client-app.vercel.app)
[![Client Repo](https://img.shields.io/badge/💻_Client_Repo-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/Partho-Mukherjee2003/wedPlan-client-app)
[![Server Repo](https://img.shields.io/badge/🖥️_Server_Repo-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/Partho-Mukherjee2003/wedplan-server-app)

</div>

---

## 📝 About (Short Description)

> 🖥️ WedPlan Server — Express.js + MongoDB backend API for the WedPlan wedding planning platform. Handles services, bookings, users, and Stripe Premium payments with signature-verified webhooks. Deployed on Vercel. 🎓 Programming Hero Assignment 9.

**Topics:** `nodejs` `expressjs` `mongodb` `stripe` `rest-api` `backend` `wedding-planner`

---

## 📖 Project Description

Backend API for **WedPlan**, a wedding planning platform with **Customer**, **Vendor**, and **Admin** roles. Built with **Express.js** and **MongoDB**, deployed on **Vercel** as a serverless app. Handles services, bookings, user management, and Stripe Premium payments with signature-verified webhooks.

> 🎓 Built as **Programming Hero Assignment 9 (Category 004)**.

---

## 🔗 Important Links

| 🔗 Link | 🌐 URL |
|---|---|
| **Live Server API** | https://wedplan-server-henna.vercel.app |
| **Live Site (Client)** | https://wedplan-client-app.vercel.app |
| **Client Repository** | https://github.com/Partho-Mukherjee2003/wedPlan-client-app |
| **Server Repository** | https://github.com/Partho-Mukherjee2003/wedplan-server-app |

---

## ✨ Features

- 💒 **Services API** — list with filters (`?status=`, `?vendorId=`), details, add / update / delete
- 📅 **Bookings API** — create with business rules, list by customer/vendor, cancel / accept / reject
- 👥 **Users API** — list all users, block / unblock
- 💳 **Stripe Payments** — Checkout Session creation + signature-verified webhook
- ⭐ **Premium Activation** — only through the verified webhook (sets plan + 30-day expiry, records transaction)
- 🔁 **Duplicate Protection** — webhook retries never create duplicate transactions
- 🆓 **Free Vendor Limit** — max 3 approved services on the free plan
- 🛡️ **Ownership Rules** — vendors/customers can only modify their own data; only pending bookings can change
- 🚫 **Blocked Users** — blocked customers cannot make bookings
- ✅ **Approved-Only Booking** — pending/rejected services cannot be booked

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Runtime** | Node.js |
| **Framework** | Express.js |
| **Database** | MongoDB Atlas |
| **Payment** | Stripe (Checkout Session + Webhook) |
| **Deployment** | Vercel (Serverless) |

---

## 📡 API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/` | Server status message |
| `GET` | `/services` | All services; supports `?status=` and `?vendorId=` filters |
| `GET` | `/services/:id` | Single service details |
| `POST` | `/services` | Vendor adds a service (default: pending; free vendors max 3 approved) |
| `PATCH` | `/services/:id` | Vendor updates own service |
| `DELETE` | `/services/:id` | Delete a service (vendor: own only; admin: any) |
| `POST` | `/bookings` | Customer books an approved service (business rules applied) |
| `GET` | `/bookings` | Bookings; supports `?customerId=` and `?vendorId=` |
| `PATCH` | `/bookings/:id` | Cancel (customer) or accept/reject (vendor) — pending only |
| `GET` | `/users` | All users (admin views, counts, vendor info) |
| `PATCH` | `/users/:id/block` | Admin blocks / unblocks a user |
| `PATCH` | `/services/:id/status` | Admin approves / rejects a service |
| `GET` | `/transactions` | All payment transactions (view only) |
| `POST` | `/create-checkout-session` | Creates a Stripe Checkout session (Premium ৳4,999) |
| `POST` | `/webhook` | Stripe webhook — verifies signature, activates Premium, records transaction |

---

## ⚙️ Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
MONGODB_URI=your_mongodb_connection_string
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
CLIENT_URL=http://localhost:3000
PORT=5000
```

> ⚠️ Never commit real secrets. Keep them only in environment variables.

---

## 🚀 Installation & Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/Partho-Mukherjee2003/wedplan-server-app.git

# 2. Go to the project folder
cd wedplan-server-app

# 3. Install dependencies
npm install

# 4. Run the server
npm run dev
```

🌐 The server runs on **http://localhost:5000**.

### 🧪 Local Stripe Webhook Testing

```bash
stripe listen --events checkout.session.completed --forward-to localhost:5000/webhook
```

Use the `whsec_...` secret from the CLI output as `STRIPE_WEBHOOK_SECRET` in your local `.env`.

---

## ☁️ Deployment

Deployed on **Vercel** as a serverless Express app:

- `api/index.js` exports the Express app
- `vercel.json` rewrites all routes to `/api`
- MongoDB Atlas Network Access allows `0.0.0.0/0` so the deployed server can connect
- Production environment variables are set in the Vercel project settings

---

## 👨‍💻 Author

<div align="center">

### Partho Mukherjee

*Full Stack Developer (MERN) · BSc in Computer Science & Engineering, ISTT*

[![Gmail](https://img.shields.io/badge/Gmail-parthomukherjee582@gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:parthomukherjee582@gmail.com)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-partho--mukherjee2005-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/partho-mukherjee2005)
[![GitHub](https://img.shields.io/badge/GitHub-Partho--Mukherjee2003-181717?style=for-the-badge&logo=github)](https://github.com/Partho-Mukherjee2003)

</div>

---

<div align="center">

💍 **WedPlan** — *Plan Your Dream Wedding Beautifully & Easily* ✨

Made with ❤️ by **Partho Mukherjee**

</div>
