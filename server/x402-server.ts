import { baseSepolia } from "viem/chains";
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { Facilitator } from "./x402/facilitator.js";

dotenv.config();

const app = express();
app.use(express.json());

if (!process.env.EVM_PRIVATE_KEY) {
  throw new Error("EVM_PRIVATE_KEY environment variable is required");
}

const facilitator = new Facilitator({
  evmPrivateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
  networks: [baseSepolia],
});

// GET /supported - List supported payment kinds
app.get("/supported", (_req: Request, res: Response) => {
  try {
    const supportedKinds = facilitator.listSupportedKinds();
    res.json({ supportedKinds });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: errorMessage });
  }
});

// POST /verify - Verify payment
app.post("/verify", async (req: Request, res: Response) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing required fields: paymentPayload and paymentRequirements"
      });
    }

    const result = await facilitator.verifyPayment(paymentPayload, paymentRequirements);
    res.json({ verified: true, result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ verified: false, error: errorMessage });
  }
});

// POST /settle - Settle payment
app.post("/settle", async (req: Request, res: Response) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing required fields: paymentPayload and paymentRequirements"
      });
    }

    const result = await facilitator.settlePayment(paymentPayload, paymentRequirements);
    res.json({ settled: true, result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ settled: false, error: errorMessage });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`X402 Facilitator server running on port ${PORT}`);
  console.log(`Supported payment kinds:`, facilitator.listSupportedKinds());
});
