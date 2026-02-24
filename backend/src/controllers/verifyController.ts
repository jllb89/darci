import { Request, Response } from "express";

export const verifyDocument = async (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    idn: req.params.idn,
    message: "TODO: verify document authenticity",
  });
};
