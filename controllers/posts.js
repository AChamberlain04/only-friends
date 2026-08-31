const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const heicConvert = require("heic-convert");
const path = require("path");
const fs = require("fs");

module.exports = {
  getProfile: async (req, res) => {
    try {
      const posts = await Post.find({ user: req.user.id });
      res.render("profile.ejs", { posts: posts, user: req.user });
    } catch (err) {
      console.log(err);
    }
  },

  getFeed: async (req, res) => {
    try {
      const posts = await Post.find().sort({ createdAt: "desc" }).lean();
      res.render("feed.ejs", { posts: posts });
    } catch (err) {
      console.log(err);
    }
  },

  getPost: async (req, res) => {
    try {
      const post = await Post.findById(req.params.id);
      const comments = await Comment.find({ post: req.params.id })
        .sort({ createdAt: "desc" })
        .lean();

      res.render("post.ejs", {
        post: post,
        user: req.user,
        comments: comments,
      });
    } catch (err) {
      console.log(err);
    }
  },

  createPost: async (req, res) => {
    let uploadPath = null;
    let convertedPath = null;

    try {
      // Make sure a file was actually uploaded
      if (!req.file) {
        throw new Error("No image was uploaded");
      }

      uploadPath = req.file.path;

      const ext = path.extname(req.file.originalname).toLowerCase();

      // Convert HEIC/HEIF to JPEG
      if (ext === ".heic" || ext === ".heif") {
        convertedPath = `${req.file.path}.jpg`;

        const inputBuffer = fs.readFileSync(req.file.path);

        const outputBuffer = await heicConvert({
          buffer: inputBuffer,
          format: "JPEG",
          quality: 0.9,
        });

        fs.writeFileSync(convertedPath, outputBuffer);

        uploadPath = convertedPath;
      }

      // Upload image to Cloudinary
      const result = await cloudinary.uploader.upload(uploadPath, {
        folder: "only-friends",
      });

      console.log("BODY:", req.body);
      console.log("Image uploaded to Cloudinary:", result.secure_url);

      // Create post
      await Post.create({
        title: req.body.title,
        image: result.secure_url,
        cloudinaryId: result.public_id,
        caption: req.body.caption,
        likes: 0,
        user: req.user.id,
      });

      console.log("Post has been added!");

      res.redirect("/profile");
    } catch (err) {
      console.error("CREATE POST ERROR:", err);
      res.status(500).send("Internal Server Error");
    } finally {
      // Delete temporary uploaded file
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      // Delete converted JPEG if one was created
      if (convertedPath && fs.existsSync(convertedPath)) {
        fs.unlinkSync(convertedPath);
      }
    }
  },

  likePost: async (req, res) => {
    try {
      await Post.findOneAndUpdate(
        { _id: req.params.id },
        {
          $inc: { likes: 1 },
        }
      );

      console.log("Likes +1");
      res.redirect(`/post/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },

  deletePost: async (req, res) => {
    try {
      // Find post by id
      let post = await Post.findById({ _id: req.params.id });

      // Delete image from Cloudinary
      await cloudinary.uploader.destroy(post.cloudinaryId);

      // Delete post from database
      await Post.remove({ _id: req.params.id });

      console.log("Deleted Post");
      res.redirect("/profile");
    } catch (err) {
      console.log(err);
      res.redirect("/profile");
    }
  },
};