import mongoose from "mongoose";

export const GetCities = async (req, res) => {
  try {
    const db = mongoose.connection.db;

    // Use projection to get only the "Name" field
    const citiesData = await db
      .collection("cities")
      .find({}, { projection: { Name: 1 } })
      .toArray();

    const cityNames = citiesData.map(city => city.Name);

    if (cityNames.length === 0) {
      return res.status(404).json({
        payload: cityNames,
        message: "Unable to load cities at the moment",
      });
    }

    return res.status(200).json({
      payload: cityNames,
      message: "Cities fetched successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
