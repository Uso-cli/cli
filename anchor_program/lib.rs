use anchor_lang::prelude::*;

declare_id!("Your_Program_ID_Here"); // Solpg will generate this for you

#[program]
pub mod uso_verifier {
    use super::*;

    pub fn verify_setup(ctx: Context<Verify>) -> Result<()> {
        let user = &ctx.accounts.user;
        msg!("Success! Dev {} has a working Solana environment.", user.key());
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Verify<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}
