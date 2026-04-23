import { Request, Response } from "express";
import {
  buildMemberDashboardResponse,
  buildRoleAwareDashboard,
} from "../services/dashboardAggregationService";

export const getDashboard = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const dashboard = await buildRoleAwareDashboard({
    supabaseUserId: req.user.id,
    email: req.user.email ?? null,
    role: req.user.role ?? null,
  });

  res.status(200).json(dashboard);
};

export const getMemberDashboard = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const memberIdParam = req.query.memberId;
  if (memberIdParam && typeof memberIdParam !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "memberId must be a string",
      details: [
        {
          path: "memberId",
          message: "memberId must be a string",
        },
      ],
    });
  }

  const role = req.user.role ?? "member";
  const canImpersonate = role === "admin" || role === "service_role";
  if (memberIdParam && !canImpersonate) {
    return res.status(403).json({
      error: "forbidden",
      message: "Insufficient permissions",
    });
  }

  const dashboard = await buildMemberDashboardResponse({
    supabaseUserId: req.user.id,
    email: req.user.email ?? null,
    role: req.user.role ?? null,
    ownerUserIdOverride: memberIdParam ?? null,
  });

  res.status(200).json(dashboard);
};
