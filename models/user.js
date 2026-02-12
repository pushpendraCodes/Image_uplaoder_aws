import mongoose from "mongoose"

const userSchema = new mongoose.Schema(
  {
    name: String,
    imageKey: String, // users/1700-avatar.png
  },
  { timestamps: true }
)

export default mongoose.model("User", userSchema)
