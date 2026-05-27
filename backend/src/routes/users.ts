import { Router } from "express";
import { getMe, switchMyActiveRole, updateMe } from "../controllers/usersController";

const router = Router();

router.get("/me", getMe);
router.patch("/me", updateMe);
router.patch("/me/active-role", switchMyActiveRole);

export default router;