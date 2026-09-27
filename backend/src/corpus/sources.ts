import type { Source } from './types'

// The data sources from the challenge's Annex 1. Nothing else is indexed.
export const SOURCES: Source[] = [
  // Transparency & municipal projects
  { id: 'chisinau', url: 'https://www.chisinau.md/ro/transparenta', name: 'Primăria Municipiului Chișinău', publisher: 'Primăria Municipiului Chișinău', category: 'primaria', authority: 1 },
  { id: 'suburbii', url: 'https://suburbii.chisinau.md/', name: 'Suburbiile Chișinăului', publisher: 'Primăria Municipiului Chișinău', category: 'primaria', authority: 1 },
  { id: 'proiecte', url: 'https://proiecte.chisinau.md/', name: 'Proiecte municipale', publisher: 'Primăria Municipiului Chișinău', category: 'primaria', authority: 1 },

  // Urban mobility
  { id: 'mobilitate', url: 'https://mobilitatechisinau.md/', name: 'Direcția Generală Mobilitate Urbană', publisher: 'DG Mobilitate Urbană', category: 'transport', authority: 1 },
  { id: 'rtec', url: 'https://rtec.md/', name: 'Regia Transport Electric Chișinău', publisher: 'ÎM RTEC', category: 'transport', authority: 2 },
  { id: 'autourban', url: 'https://autourban.md/ro/rute/suburbane', name: 'Parcul Urban de Autobuze', publisher: 'ÎM Parcul Urban de Autobuze', category: 'transport', authority: 2 },
  { id: 'exdrupo', url: 'https://exdrupo.md/', name: 'Exdrupo', publisher: 'ÎM Exdrupo', category: 'transport', authority: 2 },

  // Architecture, green spaces & urban utilities
  { id: 'dgaurf', url: 'https://dgaurf.md/', name: 'Direcția Generală Arhitectură, Urbanism și Relații Funciare', publisher: 'DG Arhitectură, Urbanism și Relații Funciare', category: 'urbanism', authority: 1 },
  { id: 'dglca', url: 'https://dglca.md/', name: 'Direcția Generală Locativ-Comunală și Amenajare', publisher: 'DG Locativ-Comunală și Amenajare', category: 'locuinta', authority: 1 },
  { id: 'autosalubritate', url: 'https://autosalubritate.md/informatie-de-contact/', name: 'Regia Autosalubritate', publisher: 'ÎM Regia Autosalubritate', category: 'locuinta', authority: 2 },
  { id: 'acc', url: 'https://www.acc.md/', name: 'Apă-Canal Chișinău', publisher: 'SA Apă-Canal Chișinău', category: 'locuinta', authority: 2 },
  { id: 'agsv', url: 'https://agsv.md/diagrama-defrisare-curatare-a-arborilor-2/', name: 'Asociația de Gospodărire a Spațiilor Verzi', publisher: 'ÎM AGSV', category: 'urbanism', authority: 2 },

  // Education
  { id: 'dgets', url: 'https://chisinauedu.dgets.md/', name: 'Direcția Generală Educație, Tineret și Sport', publisher: 'DG Educație, Tineret și Sport', category: 'educatie', authority: 1 },
  { id: 'dets-riscani', url: 'https://detsriscani.md/', name: 'DETS Rîșcani', publisher: 'Direcția Educație, Tineret și Sport Rîșcani', category: 'educatie', authority: 3, district: 'riscani' },
  { id: 'dets-ciocana', url: 'https://detsciocana.educ.md/', name: 'DETS Ciocana', publisher: 'Direcția Educație, Tineret și Sport Ciocana', category: 'educatie', authority: 3, district: 'ciocana' },
  { id: 'dets-centru', url: 'https://detscentru.md/', name: 'DETS Centru', publisher: 'Direcția Educație, Tineret și Sport Centru', category: 'educatie', authority: 3, district: 'centru' },
  { id: 'dets-buiucani', url: 'https://buiucanidets.md', name: 'DETS Buiucani', publisher: 'Direcția Educație, Tineret și Sport Buiucani', category: 'educatie', authority: 3, district: 'buiucani' },
  { id: 'dets-botanica', url: 'https://detsbotanica.md', name: 'DETS Botanica', publisher: 'Direcția Educație, Tineret și Sport Botanica', category: 'educatie', authority: 3, district: 'botanica' },
  { id: 'educatieonline', url: 'https://educatieonline.md/', name: 'Educație Online', publisher: 'DG Educație, Tineret și Sport', category: 'educatie', authority: 2 },
  { id: 'extrascolar', url: 'https://extrascolar.md/', name: 'Activități extrașcolare', publisher: 'DG Educație, Tineret și Sport', category: 'educatie', authority: 2 },
  { id: 'egradinita', url: 'https://egradinita.md/', name: 'e-Grădiniță', publisher: 'DG Educație, Tineret și Sport', category: 'educatie', authority: 2, contactUrl: 'https://egradinita.md/contacts' },
  { id: 'escoala', url: 'https://escoala.chisinau.md/', name: 'e-Școala', publisher: 'DG Educație, Tineret și Sport', category: 'educatie', authority: 2 },

  // Healthcare
  { id: 'dgams', url: 'https://dgams.md/', name: 'Direcția Generală Asistență Medicală și Socială', publisher: 'DG Asistență Medicală și Socială', category: 'sanatate', authority: 1 },
  { id: 'help', url: 'https://help.chisinau.md/', name: 'Help Chișinău', publisher: 'Primăria Municipiului Chișinău', category: 'sanatate', authority: 1 },
  { id: 'amt-botanica', url: 'https://amt-botanica.md/', name: 'AMT Botanica', publisher: 'IMSP Asociația Medicală Teritorială Botanica', category: 'sanatate', authority: 3, district: 'botanica' },
  { id: 'amt-centru', url: 'https://amt-centru.md/', name: 'AMT Centru', publisher: 'IMSP Asociația Medicală Teritorială Centru', category: 'sanatate', authority: 3, district: 'centru' },
  { id: 'amt-buiucani', url: 'https://amtbuiucani.md/', name: 'AMT Buiucani', publisher: 'IMSP Asociația Medicală Teritorială Buiucani', category: 'sanatate', authority: 3, district: 'buiucani' },
  { id: 'amt-ciocana', url: 'https://amt-ciocana.md/', name: 'AMT Ciocana', publisher: 'IMSP Asociația Medicală Teritorială Ciocana', category: 'sanatate', authority: 3, district: 'ciocana' },
  { id: 'amt-riscani', url: 'http://amtriscani.md/', name: 'AMT Rîșcani', publisher: 'IMSP Asociația Medicală Teritorială Rîșcani', category: 'sanatate', authority: 3, district: 'riscani' },

  // District administration
  { id: 'pretura-botanica', url: 'https://www.botanica.md/', name: 'Pretura Botanica', publisher: 'Pretura sectorului Botanica', category: 'primaria', authority: 3, district: 'botanica' },
  { id: 'pretura-centru', url: 'https://chisinaucentru.md/', name: 'Pretura Centru', publisher: 'Pretura sectorului Centru', category: 'primaria', authority: 3, district: 'centru' },
  { id: 'pretura-ciocana', url: 'https://ciocana.md/', name: 'Pretura Ciocana', publisher: 'Pretura sectorului Ciocana', category: 'primaria', authority: 3, district: 'ciocana' },
  { id: 'pretura-riscani', url: 'https://rascani.md/', name: 'Pretura Rîșcani', publisher: 'Pretura sectorului Rîșcani', category: 'primaria', authority: 3, district: 'riscani' },
  { id: 'pretura-buiucani', url: 'https://preturabuiucani.md/', name: 'Pretura Buiucani', publisher: 'Pretura sectorului Buiucani', category: 'primaria', authority: 3, district: 'buiucani' },

  // Services (commerce, tourism, investment, youth)
  { id: 'comert', url: 'https://comert.chisinau.md/', name: 'Direcția Generală Comerț, Alimentație Publică și Prestări Servicii', publisher: 'DG Comerț, Alimentație Publică și Prestări Servicii', category: 'munca', authority: 1 },
  { id: 'visit', url: 'https://visit.chisinau.md/', name: 'Visit Chișinău', publisher: 'Primăria Municipiului Chișinău', category: 'munca', authority: 2 },
  { id: 'invest', url: 'https://invest.chisinau.md/', name: 'Invest Chișinău', publisher: 'Primăria Municipiului Chișinău', category: 'munca', authority: 2 },
  { id: 'startup', url: 'https://proiecte.chisinau.md/ro/pv-289-startup-pentru-tineri-si-migranti', name: 'Startup pentru tineri și migranți', publisher: 'Primăria Municipiului Chișinău', category: 'munca', authority: 1 },
  { id: 'etineret', url: 'https://e-tineret.md/', name: 'e-Tineret', publisher: 'DG Educație, Tineret și Sport', category: 'munca', authority: 2 },

  // Other public services
  { id: 'infocom', url: 'http://www.infocom.md/', name: 'Infocom', publisher: 'ÎM Infocom', category: 'locuinta', authority: 2 },
  { id: 'liftservice', url: 'https://liftservice.md/', name: 'Lift Service', publisher: 'ÎS Lift Service', category: 'locuinta', authority: 2 }
]

export const sourceById = new Map(SOURCES.map((s) => [s.id, s]))
