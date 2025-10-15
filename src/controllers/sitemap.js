import mongoose from "mongoose";

export const getSitemap = async (req, res) => {
  try {
    const db = mongoose.connection.db;

    const baseUrl = process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;

    // Fetch dynamic content
    const blogs = await db
      .collection("blogs")
      .find({})
      .project({ slug: 1, _id: 1, createdAt: 1, thumbnailUrl: 1, title: 1 })
      .sort({ createdAt: -1 })
      .toArray();

    const media = await db
      .collection("media")
      .find({})
      .project({ url: 1, createdAt: 1, _id: 1 })
      .sort({ createdAt: -1 })
      .toArray();

    const formatDate = (d) => {
      try {
        return new Date(d).toISOString().split("T")[0];
      } catch {
        return new Date().toISOString().split("T")[0];
      }
    };

    // Static pages to include
    const staticUrls = [
      { loc: `${baseUrl}/`, changefreq: "weekly", priority: 1.0 },
      { loc: `${baseUrl}/services`, changefreq: "weekly", priority: 0.9 },
      { loc: `${baseUrl}/become-partner`, changefreq: "monthly", priority: 0.6 },
      { loc: `${baseUrl}/loancalculator`, changefreq: "monthly", priority: 0.6 },
      { loc: `${baseUrl}/refer`, changefreq: "monthly", priority: 0.5 },
      { loc: `${baseUrl}/blogs`, changefreq: "daily", priority: 0.7 },
      { loc: `${baseUrl}/gallery`, changefreq: "weekly", priority: 0.6 }
    ];

    let urlsXml = staticUrls
      .map(
        (u) => `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join("\n");

    // Blogs (prefer slug, fallback to id)
    const blogsXml = blogs
      .map((b) => {
        const loc = `${baseUrl}/blogs/${b.slug || b._id}`;
        const lastmod = b.createdAt ? formatDate(b.createdAt) : undefined;
        const imageTag = b.thumbnailUrl
          ? `\n    <image:image>\n      <image:loc>${b.thumbnailUrl}</image:loc>\n      ${b.title ? `<image:title>${escapeXml(b.title)}</image:title>` : ""}\n    </image:image>`
          : "";
        return `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>${imageTag}\n  </url>`;
      })
      .join("\n");

    // Gallery/media entries (optional)
    const mediaXml = media
      .map((m) => {
        const lastmod = m.createdAt ? formatDate(m.createdAt) : undefined;
        return `  <url>\n    <loc>${baseUrl}/gallery</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n    <changefreq>weekly</changefreq>\n    <priority>0.5</priority>\n    <image:image>\n      <image:loc>${m.url}</image:loc>\n    </image:image>\n  </url>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlsXml}
${blogsXml}
${mediaXml}
</urlset>`;

    res.set("Content-Type", "application/xml");
    return res.status(200).send(xml);
  } catch (error) {
    console.error("sitemap generation failed", error);
    return res.status(500).send("Sitemap generation failed");
  }
};

function escapeXml(unsafe = "") {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/\'/g, "&apos;");
}
