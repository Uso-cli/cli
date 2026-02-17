import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { UsoVerifier } from "../target/types/uso_verifier";

describe("uso_verifier", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.UsoVerifier as Program<UsoVerifier>;

    it("Is initialized!", async () => {
        // Add your test here.
        const tx = await program.methods.verifySetup().rpc();
        console.log("Your transaction signature", tx);
    });
});
