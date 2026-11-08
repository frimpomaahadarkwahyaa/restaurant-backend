Smart Restaurant Management System - Assignment 2 (Node.js Backend)
Name: Yaa Frimpongmaa
Course/Section: Web Programming (SODV2201-02)

Tech: Node.js, Express, MongoDB (Mongoose), JWT, bcryptjs

How to run:
1. Run: npm install
2. Create a .env file with:
   PORT=5000
   MONGO_URI=<your MongoDB Atlas connection string>
   JWT_SECRET=<any long random text>
3. Run: npm run dev
4. API runs at http://localhost:5000

Main endpoints:
- /api/auth      register, login, me
- /api/users     list (admin), view/update (self or admin), delete (admin)
- /api/menu      view + filters (public), add/update/delete (admin)
- /api/orders    create, my orders, change items, cancel, status (admin)
- /api/reservations  create, my reservations, update, cancel, status (admin)
- /api/events    create, my events, update, cancel, status (admin)
- /api/admin/dashboard   totals, revenue, orders per day, popular items (admin)

Features: password hashing, JWT login, customer/admin roles,
data validation, double-booking protection, error handling.

Video: (file name of your video)