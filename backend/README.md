This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Modele economique

Le schema Prisma (`prisma/schema.prisma`) est deja pret pour un vrai lancement
commercial :

- **Organization** : comptes entreprise/administration avec un plan, une
  config de marque (`brandConfig`) et un glossaire specifique
  (`glossaryOverrides`). Un `User` rattache a une `Organization`
  (`organizationId`) n'est jamais soumis au quota gratuit journalier - la
  facturation se fait alors au niveau de l'organisation (a batir separement).
- **Quota gratuit** (`lib/quota.ts`) : chaque `User` sans organisation a droit
  a `DAILY_FREE_LIMIT` requetes par jour (`requestsToday` / `quotaResetAt`,
  reset a minuit UTC), puis peut consommer des credits payants
  (`paidCreditsLeft`).
- **Payment** : chaque achat de credits cree une ligne `Payment`
  (`provider`, `amountFcfa`, `creditsGranted`, `status`). Le flux de credit
  (creation -> confirmation -> incrementation de `paidCreditsLeft`) est reel
  et deja branche sur `app/api/pay/route.ts` et le bouton de paiement de
  `app/page.tsx`.

Il ne manque qu'une **vraie integration de paiement mobile money** (Orange
Money, Wave, CinetPay...) pour remplacer `app/api/pay/route.ts`, qui est
actuellement un **mock** : il simule une confirmation immediate sans appel
reseau reel. Le reste du modele (schema, quota, organisations) est concu pour
ne pas changer lors de cette bascule.
