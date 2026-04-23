import { Router } from "express";
import {
  getRequest,
  getRequestTimeline,
  listRequests,
} from "../controllers/requestsController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.use(requireRole(["member", "notary", "admin", "service_role"]));

router.get("/", listRequests);
router.get("/:id", getRequest);
router.get("/:id/timeline", getRequestTimeline);

export default router;