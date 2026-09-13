"use server";

export async function scrapeProductData(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 3600 },
    });
    const html = await response.text();

    const titleMatch =
      html.match(
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
      ) || html.match(/<title>([^<]+)<\/title>/i);
    const imageMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    );
    const priceMatch = html.match(
      /<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i,
    );

    return {
      title: titleMatch ? titleMatch[1].trim() : "Objet sans titre",
      image_url: imageMatch ? imageMatch[1] : "",
      price: priceMatch ? parseFloat(priceMatch[1]) : null,
      url,
    };
  } catch (e) {
    return { title: "", image_url: "", price: null, url };
  }
}
