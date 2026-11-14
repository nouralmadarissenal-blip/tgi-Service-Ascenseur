# TGI Manager Pro

Application React/Vite pour la gestion de TGI Ascenseurs, avec authentification
Firebase, routes par rôle et configuration PWA.

## Démarrage

1. Installez les dépendances avec `npm install`.
2. Activez Email/Mot de passe dans Firebase Authentication et créez les comptes.
3. Pour chaque compte, créez `users/{uid}` dans Firestore (où `{uid}` est l’UID
   Firebase Authentication) avec `active: true`, un `role` autorisé et les champs
   `name` et `email`.
4. Lancez `npm run dev`.

La configuration Firebase du client est dans `src/firebase/config.js`.
Authentication, Firestore et Storage y sont initialisés.

## Rôles et accès

- `SuperAdmin` : accès à toutes les routes, dont les paramètres société.
- `Directeur` : tableau de bord, finance et validations.
- `Commercial` : tableau de bord, clients, contrats et facturation.
- `Directeur` et `SuperAdmin` : stock, bons de commande et bons de livraison.
- `Directeur`, `Commercial` et `SuperAdmin` : facturation et recouvrement.

Seuls les rôles ci-dessus sont reconnus. Les comptes inactifs ou sans rôle valide
ne peuvent pas accéder aux pages protégées.

La protection des routes est côté client. Les règles de sécurité Firestore et
Storage doivent également contrôler les accès aux données côté serveur.

## Données Firestore utilisées

- `clients` : `name`, `clientType` (`Syndic`, `Promoteur Immobilier`,
  `Entreprise` ou `Particulier`), `contactName`, `phone`/`phone1`, `phone2`,
  `email`, `address`, `city`, `postalCode`, `elevators[]` (objets avec
  `id`, `reference`, `brand`, `type`, `floors` et `status`), `elevatorCount`,
  `undetailedElevatorCount` et `elevatorBrands`. Les fiches historiques sans
  `elevators[]` conservent leur nombre d’ascenseurs et sont signalées comme
  équipements à détailler. Contrat et finance : `contractType` (`Garantie`,
  `Maintenance` ou `Aucun`), `contractStatus` (`Actif`, `Suspendu` ou
  `Aucun`), `contractEndDate` et `currentBalance`. Les identifiants `ice`,
  `rc`, `if`, `patente` et les `notes` sont également conservés. La fiche PDF
  technique présente le parc et l’historique des factures.
- `settings/company` : configuration société centrale. Identité et contact :
  `companyName`, `legalName`, `legalForm`, `capital`, `address`, `city`,
  `postalCode`, `phone`, `mobileEmergency`, `whatsapp`, `email` et `website`.
  Identifiants et banque : `ice`, `rc`, `if`, `patente`, `cnss`, `bankName`,
  `rib` et `swiftBic`. Documents : `logoBase64`, `stampBase64`,
  `autoStampEnabled`, `documentFooter` et `defaultTermsAndConditions`.
  Les logos et cachets acceptent PNG/JPEG/WebP jusqu’à 700 Ko chacun; les
  anciens `logoUrl` restent acceptés. Préférences métier : `defaultVatRate`,
  `defaultCurrency` (MAD, EUR ou USD), `defaultQuoteValidityMonths`,
  `invoicePrefix`, `quotePrefix`, `deliveryNotePrefix` et
  `purchaseOrderPrefix`. Les numéros restent incrémentés par année et type.
  Les paramètres sont modifiables depuis la page Paramètres et les PDF les
  utilisent comme suit : coordonnées et logo dans les en-têtes, pied de page
  sur les documents, cachet sur factures/BL/reçus lorsqu’il est activé,
  coordonnées bancaires sur les factures, CGV dans les devis et contrats.
- Les exports PDF des clients, contrats, documents de vente et reçus utilisent
  les paramètres de `settings/company`, le moteur `src/utils/pdfEngine.js` et
  une pagination de page.
- `recouvrements` : `clientId`, `clientName` (facultatif), `amount`, `status`,
  `dueDate` (date Firestore ou date parseable), `reference` (facultatif). Un
  paiement non soldé dont l’échéance est passée apparaît dans les alertes.
- `interventions` : `reference`, `clientId`, `technicianId`, `elevatorId`,
  `elevatorReference`, `elevatorBrand`, `elevatorType`, `scheduledDate`,
  `scheduledAt`, `arrivalTime`, `departureTime`, `type`, `description`,
  `actionsPerformed`, `replacedParts[]` (`stockId`, `name`, `reference`,
  `quantity`), `replacedPartsText`, `timeSpent` et `status` (`Planifiée`,
  `En cours`, `En attente de pièce`, `Terminée` ou `Validée`). Les pièces
  déclarées sur un bon de travail ne décrémentent pas le stock. Les anciens
  champs `elevatorIdentifier` et les déclarations de pièces en texte libre
  restent pris en charge.
  Les états `closed`, `clôturée`, `completed`, `terminée`, `resolved` et
  `facturée`/`validée` sont considérés comme clôturés dans les alertes.
- `technicians` : `firstName`, `lastName`, `name`, `phone`, `email`,
  `cin`, `cnss`, `specialty` (`Mécanique`, `Électrique` ou `Polyvalent`),
  `hourlyRate`, `hireDate`, `status` (`Disponible`, `En mission`, `En congé`
  ou `Maladie`) et le champ rétrocompatible `availability`. Le taux horaire
  est affiché et exporté uniquement pour Directeur et SuperAdmin dans
  l’interface ; les règles Firestore doivent protéger ce champ côté serveur.
- `contracts` : `reference`, `type` (`installation` ou `intervention`
  représentant la maintenance), `version` (`simple` ou `complete`), `clientId`,
  `elevatorId`, `elevatorReference`, `elevatorBrand`, `elevatorType`, `subject`,
  `scope`, `startDate`, `endDate`, `priceHT`, `taxRate`, `paymentTerms`,
  `slaResponseTime`, `billingFrequency` (`Unique`, `Mensuel`, `Trimestriel`
  ou `Annuel`), `autoRenewal`, `noticeMonths`, `amendments[]`, `status`,
  `clauses` et `generalConditions`. L’ascenseur sélectionné doit
  appartenir au parc du client. Les clauses sont préremplies selon le type et
  la version du contrat et restent modifiables ; les CGV proviennent des
  paramètres société. Chaque avenant est conservé comme une note datée dans
  `amendments[]`. Le statut affiché distingue les contrats actifs, expirés,
  ceux arrivant à échéance dans les 30 jours et les contrats en période de
  préavis de reconduction. Les échéances et préavis apparaissent également dans
  les alertes du tableau de bord.
- `stock` : `name`, `reference`/`tgiReference`, `category` (`Mécanique`,
  `Électrique`, `Cabine`, `Quincaillerie`, ainsi que les catégories historiques
  `Câbles`, `Électronique`, `Moteur` et `Autre`), `quantity`, `purchasePrice`,
  `salePrice`, `vatRate`, `alertThreshold` et le champ rétrocompatible
  `unitPrice` (aligné sur `salePrice`). Les nouvelles références sont
  préremplies avec une référence TGI modifiable ; les anciennes catégories et
  références restent affichées. Le taux de TVA proposé lors de la création
  d’un article vient de `settings/company`. Les quantités au seuil ou en
  dessous sont marquées « Critique » ou « Rupture » lorsqu’elles sont nulles.
- `sales` : documents créés dans le module Ventes, avec `type` (`quote`,
  `purchaseOrder`, `deliveryNote` ou `invoice`), `number`, client (`clientId`
  et instantané de ses coordonnées), `items[]` (dont `stockId`, `reference`,
  `name`, `quantity`, `unitPrice`, `taxRate`, `totalHT`, `taxAmount` et
  `totalTTC`), `totalHT`, `totalTax`, `totalTTC`, `issueDate`, `dueDate`,
  `paidAmount`, `remainingAmount` et `status`. Le prix unitaire est repris du
  stock au moment de la création ; le taux de TVA est choisi par ligne (20 %,
  14 %, 0 % ou le taux personnalisé des paramètres). Les montants HT et TVA
  sont arrondis par ligne au centime, puis agrégés en centimes. La devise, les
  préfixes et la validité des devis utilisent les préférences de
  `settings/company`. Les nouveaux bons de livraison commencent avec
  `stockDeducted: false`; leur validation atomique met à jour le stock et
  marque le bon afin d’empêcher une double déduction. Seuls Directeur et
  SuperAdmin disposent de cette action.
- `salesDocuments` : documents historiques (`purchaseOrder`, `deliveryNote`
  ou `invoice`) avec `number`, client (`clientId` et instantané), `items[]`,
  `totalHT`, `totalTax`, `totalTTC`, `issueDate`, `dueDate`, `paidAmount`,
  `remainingAmount` et `status`. Ils restent affichés avec les nouveaux
  documents dans le tableau de bord, les fiches clients et Ventes ; le module
  Recouvrement ne propose que les factures de `sales`.
- `salesCounters/{type-year}` : compteur transactionnel (`value`) utilisé pour
  numéroter les nouveaux documents par type et par année (par exemple
  `invoice-2026`) ; le numéro affiché utilise le préfixe configuré, l’année et
  une séquence sur au moins trois chiffres.
- `documentCounters/{type-year}` : compteur historique des documents créés
  dans `salesDocuments`.
- `payments` : `reference`, `invoiceId`, `invoiceNumber`, `clientId`,
  `invoiceCollection` (`sales`), `clientName`, `amount`, `paymentDate`, `method`
  (`Espèces`, `Chèque`, `Virement` ou `Effet`), `transactionReference` et
  `remainingAfter`. Un reçu PDF demi-page A4 est téléchargé après
  l’enregistrement d’un paiement.
  L’enregistrement du paiement et la mise à jour du solde de la facture sont
  atomiques.
- `recoveryReminders` : `invoiceId`, `invoiceCollection` (`sales`),
  `invoiceNumber`, `clientId`, `clientName`, `date`, `method` (`Appel`,
  `Email` ou `Visite`), `result` et `createdAt`. L’historique des relances est
  rattaché à la facture ; chaque reçu affiche le solde après ce paiement et les
  paiements antérieurs connus de la même facture.
- Les factures échues avec un solde restant, les contrats expirés ou arrivant
  à échéance sous 30 jours, les préavis de reconduction et les pièces sous leur
  seuil sont affichés dans les alertes critiques du tableau de bord.
- Les listes Clients, Techniciens, Interventions, Stock, Contrats, Documents de
  vente et Recouvrement proposent une recherche et une pagination. Les listes
  Clients, Techniciens, Interventions, Stock, Contrats et Recouvrement ajoutent
  des filtres métier, le tri par colonne et l’export CSV compatible Excel et
  PDF des lignes filtrées.

Les contrôles de rôles dans l’application protègent l’interface uniquement.
Les règles Firestore doivent également limiter les lectures et écritures de
`contracts`, `stock`, `sales`, `salesCounters`, `salesDocuments`,
`documentCounters`, `payments` et `recoveryReminders` selon les rôles
autorisés ; les transactions côté client ne remplacent pas ces règles.

## Vérification

- `npm run lint`
- `npm run build`
