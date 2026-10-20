// Habillage des écrans de connexion Clerk aux couleurs de superhosts.ma (bordeaux #660033,
// encre #222222, Figtree, rayon 12px, ombre douce, bouton principal en dégradé bordeaux).
export const clerkAppearance = {
  variables: {
    colorPrimary: "#660033",
    colorText: "#222222",
    colorBackground: "#ffffff",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-sans)",
  },
  elements: {
    card: "shadow-[0_1px_2px_rgba(15,26,23,0.06),0_12px_32px_-12px_rgba(15,26,23,0.18)] border border-[#ebebeb]",
    headerTitle: "font-bold text-xl tracking-[-0.02em]",
    headerSubtitle: "text-[#717171]",
    formButtonPrimary:
      "rounded-xl bg-[#660033] bg-[linear-gradient(90deg,#8A1B52_0%,#660033_50%,#4D0026_100%)] bg-[length:200%_100%] bg-[position:0_0] transition-[background-position,box-shadow] duration-300 hover:bg-[position:100%_0] hover:shadow-[0_8px_20px_-8px_rgba(102,0,51,0.6)] text-white font-semibold",
    footerActionLink: "text-[#660033] hover:text-[#4D0026] font-semibold",
  },
};
