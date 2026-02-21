# Commission Calculator Project Overview

I have cloned and thoroughly reviewed the `amfg-commission-calculator` repository. The project is a comprehensive, full-stack TypeScript application designed to calculate sales commissions for your team. It is in a very advanced state of development, with a rich feature set and a robust technical foundation.

Below is a summary of my findings.

## Technical Stack

The application is built on a modern and powerful stack:

| Category      | Technology                                                                                               |
| :------------ | :------------------------------------------------------------------------------------------------------- |
| **Language**  | TypeScript                                                                                               |
| **Frontend**  | React, Vite, TailwindCSS, shadcn/ui, Radix UI                                                              |
| **Backend**   | Node.js, Express                                                                                         |
| **API**       | tRPC                                                                                                     |
| **Database**  | MySQL with Drizzle ORM                                                                                   |
| **Testing**   | Vitest                                                                                                   |

## Key Features Implemented

The `todo.md` file indicates that a vast majority of the planned features are already complete. The application currently supports:

- **Account Executive (AE) Management**: AEs can register and log in using a PIN.
- **Tier Calculation Engine**: Automatically calculates an AE's tier (Bronze, Silver, Gold) based on a 3-month rolling average of ARR, demos, and dials, plus a 6-month retention rate.
- **Commission Calculation**: Calculates commission payouts for both annual and monthly contracts, handling referrals, and onboarding fee deductions.
- **Commission Structure Versioning**: Allows for creating and managing different versions of the commission structure, ensuring that historical deals are calculated with the correct rates and rules.
- **Deal Management**: AEs can log new deals and view their deal history.
- **Dashboard**: A comprehensive dashboard that displays:
    - Current tier status and progress towards the next tier.
    - A commission forecast calculator.
    - Recent deals.
- **Payout Calendar**: A forward-looking calendar that shows all future commission payouts, grouped by month.
- **Responsive Design**: The application is fully responsive and works well on mobile devices.

## Business Logic

The core business logic is well-defined and centralized in the `shared/commission.ts` file. This file contains the functions for calculating tiers and commissions, and it is thoroughly tested. The key aspects of the business logic are:

- **Tiers**: Tiers are determined by performance against set targets for ARR, demos, and dials. New joiners have a grace period where some criteria are waived.
- **Commission Rates**: Commission rates are determined by the AE's tier.
- **Contract Types**: The system handles both annual and monthly contracts, with different payout schedules.
- **Deductions**: The system correctly handles deductions for referrals and for deals where the onboarding fee was not paid.
- **Currency Conversion**: All ARR values are in USD, and commission payouts are converted to GBP at the live exchange rate.

## Next Steps

The project is in excellent shape. The `HANDOVER.md` file provides clear instructions for the next agent, and the codebase is well-structured and documented. The `todo.md` list is complete, suggesting that the initial scope of work has been fulfilled.

Given the advanced state of the project, I recommend we discuss what you would like to do next. We could:

1.  **Deploy the application** to a production environment so your team can start using it.
2.  **Add new features** that are not on the current `todo.md` list.
3.  **Perform a final round of testing and quality assurance** to ensure everything is working as expected.

Please let me know how you would like to proceed.
