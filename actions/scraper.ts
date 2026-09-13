"use server";

export async function scrapeProductData(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Unsupported URL protocol");
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const isPrivateIpv4 =
      /^(10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/.test(
        hostname,
      );
    if (
      hostname === "localhost" ||
      hostname === "[::1]" ||
      hostname === "::1" ||
      isPrivateIpv4 ||
      hostname.endsWith(".local")
    ) {
      throw new Error("Private URLs are not allowed");
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      throw new Error(`Product page returned ${response.status}`);
    }

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
  } catch {
    return { title: "", image_url: "", price: null, url };
  }
}
