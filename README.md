# Lab System Backend

This repository is the Node.js / Express backend specifically developed to support the `lab-system-frontend` project.

It acts as the core API, connecting to a MongoDB Atlas cluster to handle data persistency and business logic.

## Core Purpose

- **Authentication & User Management**: Role-Based Authorization for Lab Managers, Teachers, and Students.
- **Inventory Tracking**: Centralized database for laboratory equipment quantities and availability.
- **Ticketing & Orders**: Endpoint flow for borrowing items and returning them to inventory.
- **Liability Tracking**: Management routes for logging damaged lab items and resolving student liabilities.

## Tech Stack

- **Environment**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Security**: JWT (Stateless Authentication) & bcryptjs (Hashing)

## Setup

Create a `.env` file in the root directory mirroring the following variables before starting the server:

```
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster0...
JWT_SECRET=yoursecret
```

Run dependencies and start the app:

```bash
npm install
npm run dev
```
