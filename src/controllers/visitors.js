import mongoose from "mongoose";



export const addVisitor = async (req, res) => {
  try {
    const { ip } = req.body;

    if (!ip) {
      console.error("IP address is missing");
      return res.status(400).json({
        message: "IP address is missing",
      });
    }

    const db = mongoose.connection.db;

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // 01 to 12

    // Dynamically create the update path: "years.2025.05"
    const updatePath = `years.${year}.${month}`;

    await db.collection("visitors").updateOne(
      { name: "counter" },
      { $inc: { [updatePath]: 1 } },
      { upsert: true }
    );

    return res.status(200).json({
      message: "Visitor recorded",
    });

  } catch (error) {
    console.error("Error adding visitor:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};



const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec"
];

export const getDashboardNumbers = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Get year filter from query (12 = This Year, 24 = Previous Year)
    const yearFilter = parseInt(req.query.months) || 12;

    let startOfRange;
    let endOfRange;
    let monthSeries;

    if (yearFilter === 24) {
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      start.setUTCMonth(start.getUTCMonth() - 23);
      startOfRange = start;
      endOfRange = end;

      monthSeries = [];
      const cursor = new Date(Date.UTC(startOfRange.getUTCFullYear(), startOfRange.getUTCMonth(), 1, 0, 0, 0, 0));
      while (cursor <= endOfRange) {
        const y = cursor.getUTCFullYear();
        const m = cursor.getUTCMonth() + 1;
        const month = String(m).padStart(2, "0");
        const key = `${y}-${month}`;
        const label = `${MONTH_NAMES[m - 1]} ${String(y).slice(-2)}`;
        monthSeries.push({ key, year: y, month, label });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    } else {
      let startYear, endYear;

      if (currentMonth >= 5) {
        startYear = currentYear;
        endYear = startYear + 1;
      } else {
        startYear = currentYear - 1;
        endYear = startYear + 1;
      }

      const monthOrder = ["05", "06", "07", "08", "09", "10", "11", "12", "01", "02", "03", "04"];

      startOfRange = new Date(`${startYear}-05-01T00:00:00.000Z`);
      endOfRange = new Date(`${endYear}-04-30T23:59:59.999Z`);

      monthSeries = monthOrder.map((month) => {
        const isStartYearMonth = parseInt(month) >= 5;
        const year = isStartYearMonth ? startYear : endYear;
        const m = parseInt(month);
        const key = `${year}-${month}`;
        const label = MONTH_NAMES[m - 1];
        return { key, year, month, label };
      });
    }

    const monthlyData = {};
    monthSeries.forEach(({ key }) => {
      monthlyData[key] = {
        applications: 0,
        users: 0,
        visitors: 0,
        enquiries: 0,
      };
    });

    // Applications
    const applications = await db.collection("applications").find({
      createdAt: { $gte: startOfRange, $lte: endOfRange }
    }).toArray();

    applications.forEach(app => {
      const date = new Date(app.createdAt);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      if (monthlyData[key]) monthlyData[key].applications += 1;
    });

    // Customers
    const customers = await db.collection("customers").find({
      createdAt: { $gte: startOfRange, $lte: endOfRange }
    }).toArray();

    customers.forEach(cust => {
      const date = new Date(cust.createdAt);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      if (monthlyData[key]) monthlyData[key].users += 1;
    });

    // Enquiries
    const enquiries = await db.collection("enquiries").find({
      createdAt: { $gte: startOfRange, $lte: endOfRange }
    }).toArray();

    enquiries.forEach(enq => {
      const date = new Date(enq.createdAt);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      if (monthlyData[key]) monthlyData[key].enquiries += 1;
    });

    // Visitors - fetch for all years in the range
    const visitorDoc = await db.collection("visitors").findOne({ name: "counter" });

    if (visitorDoc?.years) {
      monthSeries.forEach(({ key, year, month }) => {
        const yearData = visitorDoc.years?.[year.toString()];
        const val = yearData?.[month];
        if (typeof val === "number" && monthlyData[key]) {
          monthlyData[key].visitors += val;
        }
      });
    }

    // Final formatted response
    const result = monthSeries.map(({ key, label }) => ({
      month: label,
      visitors: monthlyData[key].visitors,
      users: monthlyData[key].users,
      applications: monthlyData[key].applications,
      enquiries: monthlyData[key].enquiries,
    }));

    return res.status(200).json({ payload: result });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
