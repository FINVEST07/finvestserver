import mongoose from "mongoose";

const validItemTypes = new Set(["blog", "property", "job"]);

const collectionByType = {
  blog: "blogs",
  property: "properties",
  job: "jobs",
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const toggleFavourite = async (req, res) => {
  try {
    const { itemId, itemType } = req.body || {};

    if (!itemId || !itemType) {
      return res.status(400).json({
        status: false,
        message: "itemId and itemType are required",
      });
    }

    if (!validItemTypes.has(itemType)) {
      return res.status(400).json({
        status: false,
        message: "itemType must be blog, property or job",
      });
    }

    const normalizedItemId = String(itemId).trim();
    if (!isValidObjectId(normalizedItemId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid itemId",
      });
    }

    const db = mongoose.connection.db;
    const itemCollection = collectionByType[itemType];

    const existingItem = await db.collection(itemCollection).findOne({
      _id: new mongoose.Types.ObjectId(normalizedItemId),
    });

    if (!existingItem) {
      await db.collection("users").updateOne(
        { email: req.authUser.email },
        { $pull: { favourites: { type: itemType, id: normalizedItemId } } }
      );

      return res.status(404).json({
        status: false,
        message: "Item no longer exists",
      });
    }

    const existingFavourite = await db.collection("users").findOne({
      email: req.authUser.email,
      favourites: { $elemMatch: { type: itemType, id: normalizedItemId } },
    });

    if (existingFavourite) {
      await db.collection("users").updateOne(
        { email: req.authUser.email },
        { $pull: { favourites: { type: itemType, id: normalizedItemId } } }
      );

      return res.status(200).json({
        status: true,
        action: "removed",
        favourite: { type: itemType, id: normalizedItemId },
      });
    }

    await db.collection("users").updateOne(
      { email: req.authUser.email },
      {
        $addToSet: {
          favourites: { type: itemType, id: normalizedItemId },
        },
      }
    );

    return res.status(200).json({
      status: true,
      action: "added",
      favourite: { type: itemType, id: normalizedItemId },
    });
  } catch (error) {
    console.error("toggleFavourite error", error);
    return res.status(500).json({
      status: false,
      message: "Failed to toggle favourite",
    });
  }
};

export const getFavourites = async (req, res) => {
  try {
    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne(
      { email: req.authUser.email },
      { projection: { favourites: 1 } }
    );

    const favouritesRaw = Array.isArray(user?.favourites) ? user.favourites : [];

    const deduped = [];
    const seen = new Set();

    for (const fav of favouritesRaw) {
      const favType = typeof fav?.type === "string" ? fav.type : "";
      const favId = typeof fav?.id === "string" ? fav.id : "";
      if (!validItemTypes.has(favType) || !favId || !isValidObjectId(favId)) continue;

      const key = `${favType}:${favId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({ type: favType, id: favId });
    }

    const blogIds = deduped
      .filter((f) => f.type === "blog")
      .map((f) => new mongoose.Types.ObjectId(f.id));

    const propertyIds = deduped
      .filter((f) => f.type === "property")
      .map((f) => new mongoose.Types.ObjectId(f.id));

    const jobIds = deduped
      .filter((f) => f.type === "job")
      .map((f) => new mongoose.Types.ObjectId(f.id));

    const [blogs, properties, jobs] = await Promise.all([
      blogIds.length
        ? db.collection("blogs").find({ _id: { $in: blogIds } }).sort({ createdAt: -1 }).toArray()
        : Promise.resolve([]),
      propertyIds.length
        ? db.collection("properties").find({ _id: { $in: propertyIds } }).sort({ createdAt: -1 }).toArray()
        : Promise.resolve([]),
      jobIds.length
        ? db.collection("jobs").find({ _id: { $in: jobIds } }).sort({ createdAt: -1 }).toArray()
        : Promise.resolve([]),
    ]);

    const existingBlogIds = new Set(blogs.map((b) => String(b._id)));
    const existingPropertyIds = new Set(properties.map((p) => String(p._id)));
    const existingJobIds = new Set(jobs.map((j) => String(j._id)));

    const cleanedFavourites = deduped.filter((fav) => {
      if (fav.type === "blog") return existingBlogIds.has(fav.id);
      if (fav.type === "property") return existingPropertyIds.has(fav.id);
      if (fav.type === "job") return existingJobIds.has(fav.id);
      return false;
    });

    const shouldSync =
      cleanedFavourites.length !== favouritesRaw.length ||
      cleanedFavourites.some((f, index) => {
        const raw = favouritesRaw[index];
        return raw?.type !== f.type || raw?.id !== f.id;
      });

    if (shouldSync) {
      await db.collection("users").updateOne(
        { email: req.authUser.email },
        { $set: { favourites: cleanedFavourites } }
      );
    }

    return res.status(200).json({
      status: true,
      payload: {
        favourites: cleanedFavourites,
        blogs,
        properties,
        jobs,
      },
    });
  } catch (error) {
    console.error("getFavourites error", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch favourites",
    });
  }
};
