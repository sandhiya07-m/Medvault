const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['healthworker', 'doctor', 'admin'], required: true },
    facility: { type: String, default: 'Unassigned', trim: true },
    // New staff accounts wait for admin approval.
    status: { type: String, enum: ['pending', 'active', 'deactivated'], default: 'pending' },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    facility: this.facility,
    status: this.status,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
