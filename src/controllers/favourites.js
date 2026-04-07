import mongoose from "mongoose";

const validItemTypes = new Set(["blog", "property", "job"]);

const collectionByType = {
  blog: "blogs",
  property: "properties",
  job: "jobs",
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNormalizedId = (value) => String(value || "").trim();

const buildIdQuery = (rawId) => {
  const normalizedId = toNormalizedId(rawId);
  if (!normalizedId) return null;

  if (isValidObjectId(normalizedId)) {
    return {
      $or: [
        { _id: new mongoose.Types.ObjectId(normalizedId) },
        { _id: normalizedId },
      ],
    };
  }

  return { _id: normalizedId };
};

const buildBulkIdQuery = (ids) => {
  const objectIds = [];
  const stringIds = [];

  for (const id of ids) {
    const normalizedId = toNormalizedId(id);
    if (!normalizedId) continue;

    if (isValidObjectId(normalizedId)) {
      objectIds.push(new mongoose.Types.ObjectId(normalizedId));
    }

    stringIds.push(normalizedId);
  }

  const or = [];
  if (objectIds.length) {
    or.push({ _id: { $in: objectIds } });
  }
  if (stringIds.length) {
    or.push({ _id: { $in: stringIds } });
  }

  if (!or.length) return null;
  if (or.length === 1) return or[0];

  return { $or: or };
};

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

    const normalizedItemId = toNormalizedId(itemId);
    if (!normalizedItemId) {
      return res.status(400).json({
        status: false,
        message: "Invalid itemId",
      });
    }

    const db = mongoose.connection.db;
    const itemCollection = collectionByType[itemType];

    const itemLookupQuery = buildIdQuery(normalizedItemId);
    const existingItem = itemLookupQuery
      ? await db.collection(itemCollection).findOne(itemLookupQuery)
      : null;

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
      const favId = toNormalizedId(fav?.id);
      if (!validItemTypes.has(favType) || !favId) continue;

      const key = `${favType}:${favId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({ type: favType, id: favId });
    }

    const blogIds = deduped.filter((f) => f.type === "blog").map((f) => f.id);

    const propertyIds = deduped.filter((f) => f.type === "property").map((f) => f.id);

    const jobIds = deduped.filter((f) => f.type === "job").map((f) => f.id);

    const blogQuery = buildBulkIdQuery(blogIds);
    const propertyQuery = buildBulkIdQuery(propertyIds);
    const jobQuery = buildBulkIdQuery(jobIds);

    const [blogs, properties, jobs] = await Promise.all([
      blogQuery
        ? db.collection("blogs").find(blogQuery).sort({ createdAt: -1 }).toArray()
        : Promise.resolve([]),
      propertyQuery
        ? db.collection("properties").find(propertyQuery).sort({ createdAt: -1 }).toArray()
        : Promise.resolve([]),
      jobQuery
        ? db.collection("jobs").find(jobQuery).sort({ createdAt: -1 }).toArray()
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
