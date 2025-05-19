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
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export const getDashboardNumbers = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // If current month is Jan/Feb/Mar, fiscal year started last year
    const fiscalStartYear = currentMonth <= 3 ? currentYear - 1 : currentYear;
    const fiscalEndYear = fiscalStartYear + 1;

    const startOfFinancialYear = new Date(`${fiscalStartYear}-04-01T00:00:00.000Z`);
    const endOfFinancialYear = new Date(`${fiscalEndYear}-03-31T23:59:59.999Z`);

    // Financial year months: 04 (Apr) to 03 (Mar next year)
    const monthOrder = [
      "04", "05", "06", "07", "08", "09",
      "10", "11", "12", "01", "02", "03"
    ];

    // Init structure
    const monthlyData = {};
    monthOrder.forEach(month => {
      monthlyData[month] = { applications: 0, users: 0, visitors: 0 };
    });

    // Applications
    const applications = await db.collection("applications").find({
      createdAt: { $gte: startOfFinancialYear, $lte: endOfFinancialYear }
    }).toArray();

    applications.forEach(app => {
      const date = new Date(app.createdAt);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      if (monthlyData[month]) monthlyData[month].applications += 1;
    });

    // Customers
    const customers = await db.collection("customers").find({
      createdAt: { $gte: startOfFinancialYear, $lte: endOfFinancialYear }
    }).toArray();

    customers.forEach(cust => {
      const date = new Date(cust.createdAt);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      if (monthlyData[month]) monthlyData[month].users += 1;
    });

    // Visitors
    const visitorDoc = await db.collection("visitors").findOne({ name: "counter" });

    if (visitorDoc?.years) {
      const visitorYears = [fiscalStartYear, fiscalEndYear];
      visitorYears.forEach(year => {
        const yearData = visitorDoc.years[year];
        if (yearData) {
          for (const month in yearData) {
            if (monthlyData[month]) {
              monthlyData[month].visitors += yearData[month];
            }
          }
        }
      });
    }

    // Format result in April to March order
    const result = monthOrder.map(monthNum => ({
      month: MONTH_NAMES[parseInt(monthNum) - 1],
      visitors: monthlyData[monthNum].visitors,
      users: monthlyData[monthNum].users,
      applications: monthlyData[monthNum].applications
    }));

    return res.status(200).json({ payload: result });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
