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

    // Financial year: May to April
    // This Year: May 2025 - April 2026
    // Previous Year: May 2024 - April 2025
    let startYear, endYear;
    
    if (currentMonth >= 5) {
      // We're in May or later, so "This Year" is currentYear to currentYear+1
      startYear = yearFilter === 24 ? currentYear - 1 : currentYear;
      endYear = startYear + 1;
    } else {
      // We're in Jan-Apr, so "This Year" is previousYear to currentYear
      startYear = yearFilter === 24 ? currentYear - 2 : currentYear - 1;
      endYear = startYear + 1;
    }

    // Month order: May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar, Apr
    const monthOrder = ["05", "06", "07", "08", "09", "10", "11", "12", "01", "02", "03", "04"];

    const startOfRange = new Date(`${startYear}-05-01T00:00:00.000Z`);
    const endOfRange = new Date(`${endYear}-04-30T23:59:59.999Z`);

    const monthlyData = {};
    monthOrder.forEach(month => {
      monthlyData[month] = {
        applications: 0,
        users: 0,
        visitors: 0,
        enquiries: 0
      };
    });

    // Applications
    const applications = await db.collection("applications").find({
      createdAt: { $gte: startOfRange, $lte: endOfRange }
    }).toArray();

    applications.forEach(app => {
      const date = new Date(app.createdAt);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      if (monthlyData[month]) monthlyData[month].applications += 1;
    });

    // Customers
    const customers = await db.collection("customers").find({
      createdAt: { $gte: startOfRange, $lte: endOfRange }
    }).toArray();

    customers.forEach(cust => {
      const date = new Date(cust.createdAt);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      if (monthlyData[month]) monthlyData[month].users += 1;
    });

    // Enquiries
    const enquiries = await db.collection("enquiries").find({
      createdAt: { $gte: startOfRange, $lte: endOfRange }
    }).toArray();

    enquiries.forEach(enq => {
      const date = new Date(enq.createdAt);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      if (monthlyData[month]) monthlyData[month].enquiries += 1;
    });

    // Visitors - fetch for all years in the range
    const visitorDoc = await db.collection("visitors").findOne({ name: "counter" });

    if (visitorDoc?.years) {
      const visitorStartYear = startOfRange.getFullYear();
      const visitorEndYear = endOfRange.getFullYear();
      
      // For May-April financial year, months 05-12 belong to start year, 01-04 to end year
      for (let year = visitorStartYear; year <= visitorEndYear; year++) {
        const yearData = visitorDoc.years[year.toString()];
        if (yearData) {
          for (const month in yearData) {
            const monthNum = parseInt(month);
            // Only count months that belong to this financial year
            // May-Dec (5-12) from start year, Jan-Apr (1-4) from end year
            const isStartYear = (year === visitorStartYear);
            const isEndYear = (year === visitorEndYear);
            const belongsToFinancialYear = (isStartYear && monthNum >= 5) || (isEndYear && monthNum <= 4);
            
            if (monthlyData[month] && belongsToFinancialYear) {
              monthlyData[month].visitors += yearData[month];
            }
          }
        }
      }
    }

    // Final formatted response
    const result = monthOrder.map(monthNum => ({
      month: MONTH_NAMES[parseInt(monthNum) - 1],
      visitors: monthlyData[monthNum].visitors,
      users: monthlyData[monthNum].users,
      applications: monthlyData[monthNum].applications,
      enquiries: monthlyData[monthNum].enquiries
    }));

    return res.status(200).json({ payload: result });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
