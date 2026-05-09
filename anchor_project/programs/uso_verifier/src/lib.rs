use anchor_lang::prelude::*;

declare_id!("DxpMwS8nm9djeipqnbeX5kWm2DDJeicuFweNmxvsrBnE");

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
