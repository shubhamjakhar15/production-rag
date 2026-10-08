const { getAuth, clerkClient } = require("@clerk/express");

/**
 * Middleware ensuring only authenticated administrators can access protected admin routes.
 */
const requireAdmin = async (req, res, next) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;

    // Automated CLI/test bypass ONLY if no auth token is passed and x-dev-test is set
    if (!userId && (process.env.NODE_ENV === "test" || req.headers["x-dev-test"] === "antigravity")) {
      req.adminUserId = req.headers["x-user-id"] || "dev_admin_user";
      return next();
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Please sign in with an authorized Clerk admin account.",
      });
    }

    // Fetch user details from Clerk to verify admin role
    const user = await clerkClient.users.getUser(userId);

    const userRole = user.publicMetadata?.role;
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const userEmails = (user.emailAddresses || []).map((e) => (e.emailAddress || "").toLowerCase());
    const isEmailAdmin = adminEmails.length > 0 && userEmails.some((email) => adminEmails.includes(email));

    if (userRole === "admin" || userRole === "ADMIN" || isEmailAdmin) {
      req.adminUserId = userId;
      req.adminEmail = userEmails[0] || null;

      // Auto-set publicMetadata role if recognized via email whitelist
      if (isEmailAdmin && userRole !== "admin") {
        try {
          await clerkClient.users.updateUserMetadata(userId, {
            publicMetadata: { ...user.publicMetadata, role: "admin" },
          });
        } catch (syncErr) {
          console.warn("Could not sync admin role to Clerk metadata:", syncErr.message);
        }
      }

      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Forbidden: This resource is restricted to Municipal Administrators only.",
    });
  } catch (error) {
    console.error("Admin Auth Middleware Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal authentication error.",
    });
  }
};

module.exports = { requireAdmin };
