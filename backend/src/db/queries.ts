import { pool } from "./pool";

export const createDocument = async () => {
  return pool.query("SELECT 1");
};

export const getDocumentById = async () => {
  return pool.query("SELECT 1");
};

export const createNotarizationRequest = async () => {
  return pool.query("SELECT 1");
};

export const createLedgerEntry = async () => {
  return pool.query("SELECT 1");
};
