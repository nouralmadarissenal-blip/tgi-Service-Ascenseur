export function getDefaultClauses(type, version) {
  const isInstallation = type === 'installation'

  if (version === 'simple') {
    return [
      `ARTICLE 1 — OBJET\nLe présent contrat définit les conditions selon lesquelles TGI Ascenseurs réalise ${
        isInstallation
          ? 'les travaux d’installation décrits dans les conditions particulières'
          : 'les prestations d’intervention et de maintenance décrites dans les conditions particulières'
      }. Toute prestation non expressément décrite fait l’objet d’un accord écrit distinct.`,
      `ARTICLE 2 — OBLIGATIONS DES PARTIES\nTGI Ascenseurs réalise les prestations convenues avec le soin professionnel attendu. Le Client fournit les accès, informations et conditions de sécurité nécessaires, et signale sans délai toute anomalie susceptible d’affecter l’équipement.`,
      `ARTICLE 3 — PRIX ET RÈGLEMENT\nLe prix, les taxes applicables, l’échéancier et les modalités de règlement sont ceux indiqués aux conditions particulières. Toute prestation supplémentaire doit faire l’objet d’un devis accepté avant sa réalisation.`,
      `ARTICLE 4 — DURÉE ET FIN DU CONTRAT\nLes dates et la durée sont indiquées aux conditions particulières. À son terme, le contrat prend fin sauf renouvellement écrit. Chaque partie peut demander sa résiliation par notification écrite, sous réserve du règlement des prestations déjà réalisées.`,
    ].join('\n\n')
  }

  return [
    `ARTICLE 1 — OBJET ET DOCUMENTS CONTRACTUELS\nLe présent contrat a pour objet ${
      isInstallation
        ? 'la fourniture et la réalisation des travaux d’installation de l’équipement décrits aux conditions particulières'
        : 'l’exécution des prestations d’intervention et de maintenance de l’équipement décrites aux conditions particulières'
    }. Il est constitué du présent document, de ses conditions particulières et de tout avenant signé par les parties. En cas de contradiction, l’avenant le plus récent prévaut pour son objet.`,
    `ARTICLE 2 — PÉRIMÈTRE DES PRESTATIONS\nLes prestations couvertes, le site, l’équipement, le calendrier et les éventuelles exclusions sont définis aux conditions particulières. Toute modification du périmètre, demande supplémentaire ou intervention rendue nécessaire par un événement non prévu fera l’objet d’un devis ou d’un avenant accepté par le Client.`,
    `ARTICLE 3 — OBLIGATIONS DE TGI ASCENSEURS\nTGI Ascenseurs exécute les prestations convenues avec diligence et selon les règles professionnelles applicables. Elle informe le Client des difficultés susceptibles d’affecter le calendrier ou le périmètre. Les délais d’intervention mentionnés au contrat constituent des objectifs de prise en charge et ne valent pas garantie de remise en service lorsque celle-ci dépend d’un diagnostic, de pièces ou de conditions extérieures.`,
    `ARTICLE 4 — OBLIGATIONS DU CLIENT\nLe Client désigne un interlocuteur, garantit l’accès au site et à l’équipement aux dates convenues, transmet les informations utiles et maintient les locaux dans des conditions permettant une intervention en sécurité. Il s’abstient de faire intervenir un tiers sur l’équipement sans en informer TGI Ascenseurs et signale immédiatement tout incident ou risque identifié.`,
    `ARTICLE 5 — CALENDRIER, ACCÈS ET RÉCEPTION\nLes dates prévisionnelles sont convenues entre les parties et peuvent être ajustées en cas d’indisponibilité du site, de retard d’approvisionnement, de travaux préalables manquants ou d’un événement extérieur. Pour une installation, la réception est constatée par un procès-verbal ou tout document équivalent signé par les parties, avec mention des réserves éventuelles et des modalités de leur levée.`,
    `ARTICLE 6 — PRIX, FACTURATION ET PAIEMENT\nLes prix hors taxes, taxes, échéances et modalités de paiement sont précisés aux conditions particulières. Les travaux ou fournitures hors périmètre ne sont engagés qu’après acceptation écrite d’un devis. Toute contestation de facture doit être motivée par écrit, sans préjudice du règlement des sommes non contestées.`,
    `ARTICLE 7 — GARANTIE, ENTRETIEN ET EXCLUSIONS\nLa garantie éventuellement consentie et sa durée figurent aux conditions particulières. Elle ne couvre pas les dommages résultant d’une utilisation non conforme, d’une intervention non autorisée, d’un défaut d’entretien imputable au Client, d’une usure normale ou d’un événement extérieur. Pour les prestations de maintenance, les opérations et périodicités couvertes sont celles expressément prévues au périmètre.`,
    `ARTICLE 8 — RESPONSABILITÉ ET SÉCURITÉ\nChaque partie répond des dommages directs résultant de ses manquements établis, dans les limites prévues par les dispositions impératives applicables. Aucune stipulation ne limite une responsabilité qui ne peut légalement l’être. Le Client conserve la responsabilité de l’accès au site et des mesures de sécurité relevant de son exploitation, et applique les recommandations écrites communiquées par TGI Ascenseurs.`,
    `ARTICLE 9 — SUSPENSION ET RÉSILIATION\nEn cas de manquement important, la partie non défaillante peut adresser une mise en demeure écrite décrivant le manquement et laissant un délai raisonnable pour y remédier. À défaut de régularisation dans ce délai, elle peut résilier le contrat par notification écrite. Les prestations réalisées, fournitures commandées et sommes échues restent dues à la date d’effet de la résiliation.`,
    `ARTICLE 10 — CONFIDENTIALITÉ ET DONNÉES\nChaque partie protège les informations non publiques reçues dans le cadre du contrat et ne les utilise que pour son exécution, sous réserve des obligations légales ou des informations déjà publiques. Les données personnelles éventuellement échangées sont limitées à ce qui est nécessaire à la gestion de la relation contractuelle.`,
    `ARTICLE 11 — FORCE MAJEURE ET DIFFÉRENDS\nAucune partie n’est responsable d’un retard causé par un événement échappant raisonnablement à son contrôle, sous réserve d’en informer l’autre partie et de limiter ses conséquences. Les parties recherchent une solution amiable à tout différend. À défaut, le droit applicable et la juridiction compétente sont déterminés conformément aux règles impératives applicables et aux conditions particulières.`,
    `ARTICLE 12 — DISPOSITIONS FINALES\nToute modification du contrat est constatée par écrit et signée par les parties. Si une stipulation est déclarée inapplicable, les autres stipulations demeurent en vigueur dans la mesure permise par la loi. Le Client reconnaît avoir pris connaissance du périmètre et des conditions particulières avant signature.`,
  ].join('\n\n')
}
