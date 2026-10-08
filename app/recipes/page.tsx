import type { Metadata } from "next";
import Link from "next/link";
import { recipes } from "../recipes-data";
import { faqs, SITE_URL } from "../site-info";

export const metadata: Metadata = {
  title: "Sanji-Inspired One Piece Recipes | Sanji's Sea Kitchen",
  description: "Browse seven unofficial Sanji-inspired recipes with ingredients, cooking steps and story context: seafood risotto, soba, pizza, soup, sky fish and more.",
  alternates: { canonical: "/recipes" },
  openGraph: {
    title: "Sanji-Inspired One Piece Recipes",
    description: "Seven fan recipes with ingredients, cooking steps and story context.",
    url: "/recipes",
  },
};

export default function RecipeGuide() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/recipes#faq`,
        mainEntity: faqs.map(({ question, answer }) => ({
          "@type": "Question", name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
      ...recipes.map((recipe) => ({
        "@type": "Recipe",
        "@id": `${SITE_URL}/recipes#${recipe.id}`,
        url: `${SITE_URL}/recipes#${recipe.id}`,
        name: recipe.titleEn,
        description: `Unofficial fan interpretation. ${recipe.backstoryEn}`,
        recipeIngredient: recipe.ingredientsEn,
        recipeInstructions: recipe.stepsEn.map((text) => ({ "@type": "HowToStep", text })),
        inLanguage: "en",
      })),
    ],
  };

  return (
    <main className="halftone min-h-dvh px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-4xl space-y-8">
        <Link href="/" className="font-bold underline underline-offset-4">Return to the interactive kitchen</Link>
        <header className="space-y-4">
          <h1 className="font-display text-4xl sm:text-6xl">Sanji-inspired One Piece recipes</h1>
          <p>Explore seven fan interpretations of Sanji&apos;s dishes, with ingredients, cooking methods and story context. These are unofficial adaptations for a home kitchen, including substitutions for fictional ingredients.</p>
        </header>
        <nav aria-label="Recipe contents" className="border-4 border-black bg-mellow p-5">
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {recipes.map((recipe) => <li key={recipe.id}><a href={`#${recipe.id}`} className="underline underline-offset-4">{recipe.titleEn}</a></li>)}
          </ul>
        </nav>
        {recipes.map((recipe) => (
          <article key={recipe.id} id={recipe.id} className="scroll-mt-6 space-y-4 border-4 border-black bg-parchment p-5 sm:p-8">
            <h2 className="font-display text-3xl">{recipe.titleEn}</h2>
            <p>{recipe.backstoryEn}</p>
            <h3 className="font-bold">Ingredients</h3>
            <ul className="list-disc space-y-1 pl-6">{recipe.ingredientsEn.map((ingredient) => <li key={ingredient}>{ingredient}</li>)}</ul>
            <h3 className="font-bold">Cooking method</h3>
            <ol className="list-decimal space-y-2 pl-6">{recipe.stepsEn.map((step) => <li key={step}>{step}</li>)}</ol>
          </article>
        ))}
        <section id="faq" className="space-y-5 border-4 border-black bg-white p-5 sm:p-8" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl">Frequently asked questions</h2>
          {faqs.map(({ question, answer }) => <div key={question} className="space-y-2"><h3 className="font-bold">{question}</h3><p>{answer}</p></div>)}
        </section>
        <p className="text-sm">An unofficial fan parody inspired by Sanji and One Piece.</p>
      </div>
    </main>
  );
}
