/**
 * Meet the team — Welcome tab in the client onboarding packet.
 * Add portrait images under public/branding/team/ and set imageSrc (e.g. "/branding/team/sarah-vandeburgh.jpg").
 * If imageSrc is omitted, a styled initial placeholder is shown.
 */
export type ClientOnboardingTeamMember = {
  id: string;
  name: string;
  /** Shown in all caps in UI */
  title: string;
  description: string;
  imageSrc?: string | null;
  /** CSS `object-position` for portrait crops (e.g. group photos). */
  imageObjectPosition?: string;
  /** If set, name and photo open a biography dialog (Meet the Team). */
  biography?: string;
};

/** Jeff’s invite link — full office team. */
export const clientOnboardingTeamMembersJeff: ClientOnboardingTeamMember[] = [
  {
    id: "jeff",
    name: "Jeff Dillon",
    title: "Owner — Designer",
    description: "Lead designer for your project.",
    imageSrc: "/branding/team/jeff-dillon-2026-headshot.png",
    biography: `Jeff Dillon started Designer's Ink Graphic & Building Designs, LLC in 1993 in Stillwater, Oklahoma.  As the son of a home builder, he has been designing homes since the age of 14.  He has worked on residential projects ranging from tiny homes to 29,000 square foot showcase homes.  He has also worked with clients on numerous light commercial projects including laundromats, gas stations, restaurants, pharmacies, banks, retail stores, office buildings, history remodels and industrial buildings.

Jeff is married with two very active children.  He grew up in North Little Rock, Arkansas, but he has lived in Stillwater since 1992 when he arrived to attend Oklahoma State University.

His work has been featured on the Chief Architect Software website on four separate occasions, and he actively assists other Chief Architect Software users as they learn the program.

You can reach Jeff via e-mail at jeff@designersink.us`,
  },
  {
    id: "sarah",
    name: "Sarah VandeBurgh",
    title: "Drafting Specialist",
    description: "Will be handling all construction documents for your project.",
    imageSrc: "/branding/team/sarah-vandeburgh-family.png",
    /** Family photo — Sarah on the right; bias crop for the 3:4 team frame. */
    imageObjectPosition: "82% 36%",
    biography: `Sarah VandeBurgh began working with Designer's Ink in July of 2019.  She is a graduate of Meridian Technology Center's Mechanical and Architectural Drafting programs.  She interned with Designer's Ink while finishing her certifications at Meridian Technology Center before being hired upon graduation.  Sarah works with our Designers to complete technical drawings and construction documents.

You can reach Sarah via e-mail at sarah@designersink.us`,
  },
  {
    id: "jorrie",
    name: "Jorrie Holly",
    title: "Drafting Intern",
    description: "Will also be working to assist Jeff and Sarah on your project.",
    // imageSrc: "/branding/team/jorrie-holly.png",
    biography: `Jorrie Holly began her internship in 2025.  She is a student at Meridian Technology Center where she is completing her 3rd year in the Architectural Drafting program.  Jorrie works under direct supervision from our design team to complete technical drawing and construction documents.

You can reach Jorrie via e-mail at jorrie@designersink.us`,
  },
  {
    id: "lexi",
    name: "Lexi",
    title: "Security",
    description: "Provides security services for our offices.",
    imageSrc: "/branding/team/lexi-card.png",
    biography: `Lexi is a Boston Terrier who specializes in long naps and occasionally barking at people as they walk by the front door of the office.  She has been our Head of Security since moving into our new offices in January of 2019.  When not sleeping, she enjoys chasing Kevin around the office and ensuring no food gets dropped on the floor which needs immediate clean up.  She is always on the lookout for any cats which may walk by our front glass door.

She is assisted periodically by her little sister, Gracie, who joined the security team three years ago.  Her primary patrol area is at home, but when she comes to the office, she likes to constantly beg to go outside.`,
  },
];

/** Kevin’s invite link — lead designer + construction documents only. */
export const clientOnboardingTeamMembersKevin: ClientOnboardingTeamMember[] = [
  {
    id: "kevin",
    name: "Kevin Walthall",
    title: "Your Lead Designer",
    description: "Lead designer for your project.",
    imageSrc: "/branding/team/kevin-walthall.png",
    /** Family portrait — Kevin on the right; bias crop toward him in the 3:4 frame. */
    imageObjectPosition: "88% 28%",
    biography: `Kevin Walthall joined the Designer's Ink team in 2015. Before joining the team, Kevin had over 18 years of construction and building materials experience.  His expertise in building materials is a great asset to his clients as they select the right building materials for their project.

He has served on the Board of Directors for the Stillwater Home Builders Association, and he also holds a degree from Oklahoma State University in Graphic Design.

Kevin is married with two young children, and he enjoys hunting and taking his Jeep out for a spin.

You can reach Kevin via e-mail at kevin@designersink.us`,
  },
  {
    id: "chris",
    name: "Chris Fleming",
    title: "Construction Documents",
    description: "Will handle creating your construction documents.",
    imageSrc: "/branding/team/chris-fleming.png",
    /** Couple photo — Chris on the left; bias crop for the 3:4 team frame. */
    imageObjectPosition: "26% 38%",
    biography: `Chris Fleming began working with Designer's Ink in July 2020.  He is a graduate of Meridian Technology Center's Architectural Drafting program, and he has won national recognition for his work.  Chris works with our Designers to complete technical drawings and construction documents.

You can reach Chris via e-mail at chris@designersink.us`,
  },
];

/** @deprecated Use clientOnboardingTeamMembersJeff or pick by invite lead. */
export const clientOnboardingTeamMembers = clientOnboardingTeamMembersJeff;
