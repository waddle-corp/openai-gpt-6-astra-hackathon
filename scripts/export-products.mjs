import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDirectory = join(root, 'data');
const pages = join(root, 'work', 'shopify-export');
const store = 'benchmark-boosted-usa.myshopify.com';
const expectedShop = 'gid://shopify/Shop/77764526217';
const expectedProducts = 317;
const expectedCollections = 25;
const apiVersion = '2026-07';
const env = {
  ...process.env,
  SHOPIFY_CLI_NO_AUTO_UPGRADE: '1',
  SHOPIFY_CLI_AGENT_INFO: 'n:codex|v:none|p:openai|m:none',
  SHOPIFY_CLI_AGENT_IDS: '',
};
const imageFields = 'id url altText width height';
const mediaFields = `id alt mediaContentType status preview { image { ${imageFields} } } ... on MediaImage { image { ${imageFields} } } ... on Video { sources { format height mimeType url width } } ... on ExternalVideo { embeddedUrl originUrl host } ... on Model3d { sources { format filesize mimeType url } }`;
const connection = (fields) =>
  `nodes { ${fields} } pageInfo { hasNextPage endCursor }`;
const variantFields = `id legacyResourceId title displayName position price compareAtPrice sku barcode availableForSale inventoryQuantity inventoryPolicy sellableOnlineQuantity taxable requiresComponents selectedOptions { name value } inventoryItem { id tracked requiresShipping } media(first: 1) { ${connection(mediaFields)} }`;
const productFields = `id legacyResourceId title handle status description descriptionHtml vendor productType tags createdAt updatedAt publishedAt onlineStoreUrl templateSuffix totalInventory tracksInventory hasOnlyDefaultVariant requiresSellingPlan seo { title description } options { id name position optionValues { id name hasVariants } } priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } } compareAtPriceRange { minVariantCompareAtPrice { amount currencyCode } maxVariantCompareAtPrice { amount currencyCode } } featuredMedia { ${mediaFields} } variantsCount { count precision } mediaCount { count precision } variants(first: 5) { ${connection(variantFields)} } images(first: 8) { ${connection(imageFields)} } media(first: 8) { ${connection(mediaFields)} } collections(first: 8) { ${connection('id handle title')} }`;
const preflightQuery =
  'query ExportPreflight { shop { id name myshopifyDomain currencyCode } productsCount { count precision } collectionsCount { count precision } }';
let queryNumber = 0;
const startedAt = new Date().toISOString();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function query(label, body, variables = {}) {
  const prefix = `${String(++queryNumber).padStart(4, '0')}-${label}`;
  const queryPath = join(pages, `${prefix}.graphql`);
  const outputPath = join(pages, `${prefix}.json`);
  await writeFile(queryPath, body);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await exec(
        'shopify',
        [
          'store',
          'execute',
          '--store',
          store,
          '--version',
          apiVersion,
          '--query-file',
          queryPath,
          '--variables',
          JSON.stringify(variables),
          '--output-file',
          outputPath,
        ],
        { env, maxBuffer: 4 * 1024 * 1024, timeout: 60000 },
      );
      const response = JSON.parse(await readFile(outputPath, 'utf8'));
      if (response.errors?.length)
        throw new Error(JSON.stringify(response.errors));
      const data = response.data ?? response;
      assert(data && typeof data === 'object', `Missing query data: ${label}`);
      return data;
    } catch (error) {
      const detail = [error.message, error.stdout, error.stderr]
        .filter(Boolean)
        .join('\n');
      if (
        attempt < 3 &&
        /THROTTLED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up|429 Too Many Requests|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout/i.test(
          detail,
        )
      ) {
        console.log(`Transient failure in ${label}; retry ${attempt + 1}/3`);
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * (attempt + 1)),
        );
      } else throw new Error(`${label}: ${detail}`);
    }
  }
}

function uniqueById(nodes, label) {
  assert(
    nodes.every((n) => typeof n.id === 'string'),
    `Missing id in ${label}`,
  );
  assert(
    new Set(nodes.map((n) => n.id)).size === nodes.length,
    `Duplicate nodes in ${label}`,
  );
}

async function completeConnection(initial, fetchPage, label) {
  const nodes = [...initial.nodes];
  let pageInfo = initial.pageInfo;
  const cursors = new Set();
  while (pageInfo.hasNextPage) {
    assert(
      pageInfo.endCursor && !cursors.has(pageInfo.endCursor),
      `Pagination cursor did not advance for ${label}`,
    );
    cursors.add(pageInfo.endCursor);
    const next = await fetchPage(pageInfo.endCursor);
    assert(next?.nodes && next.pageInfo, `Missing page for ${label}`);
    nodes.push(...next.nodes);
    pageInfo = next.pageInfo;
  }
  uniqueById(nodes, label);
  return nodes;
}

function verifyPreflight(data) {
  assert(
    data.shop.id === expectedShop && data.shop.myshopifyDomain === store,
    'Source shop identity mismatch',
  );
  assert(data.shop.currencyCode === 'USD', 'Source currency changed');
  assert(
    data.productsCount.precision === 'EXACT' &&
      data.productsCount.count === expectedProducts,
    `Expected ${expectedProducts} products; found ${JSON.stringify(data.productsCount)}`,
  );
  assert(
    data.collectionsCount.precision === 'EXACT' &&
      data.collectionsCount.count === expectedCollections,
    `Expected ${expectedCollections} collections; found ${JSON.stringify(data.collectionsCount)}`,
  );
}

await mkdir(pages, { recursive: true });
const before = await query('preflight', preflightQuery);
verifyPreflight(before);
console.log(
  `Verified ${store}: ${expectedProducts} products, ${expectedCollections} collections, USD`,
);

const products = [];
let after = null;
do {
  const data = await query(
    'products',
    `query Products($after: String) { products(first: 10, after: $after, sortKey: ID) { ${connection(productFields)} } }`,
    { after },
  );
  const batch = data.products;
  for (const product of batch.nodes) {
    for (const [field, fields, first] of [
      ['variants', variantFields, 30],
      ['images', imageFields, 100],
      ['media', mediaFields, 50],
      ['collections', 'id handle title', 100],
    ]) {
      product[field] = await completeConnection(
        product[field],
        async (cursor) => {
          const result = await query(
            `product-${field}`,
            `query ProductConnection($id: ID!, $after: String!) { product(id: $id) { ${field}(first: ${first}, after: $after) { ${connection(fields)} } } }`,
            { id: product.id, after: cursor },
          );
          return result.product[field];
        },
        `${product.handle}.${field}`,
      );
    }
    for (const variant of product.variants) {
      variant.media = await completeConnection(
        variant.media,
        async (cursor) => {
          const result = await query(
            'variant-media',
            `query VariantMedia($id: ID!, $after: String!) { productVariant(id: $id) { media(first: 50, after: $after) { ${connection(mediaFields)} } } }`,
            { id: variant.id, after: cursor },
          );
          return result.productVariant.media;
        },
        `${variant.id}.media`,
      );
    }
    assert(
      product.variantsCount.precision === 'EXACT' &&
        product.variants.length === product.variantsCount.count,
      `Variant count mismatch: ${product.handle}`,
    );
    assert(
      product.mediaCount.precision === 'EXACT' &&
        product.media.length === product.mediaCount.count,
      `Media count mismatch: ${product.handle}`,
    );
    products.push(product);
  }
  console.log(`Products exported: ${products.length}/${expectedProducts}`);
  assert(
    !batch.pageInfo.hasNextPage ||
      (batch.pageInfo.endCursor && batch.pageInfo.endCursor !== after),
    'Product cursor did not advance',
  );
  after = batch.pageInfo.hasNextPage ? batch.pageInfo.endCursor : null;
} while (after);
uniqueById(products, 'products');
assert(
  products.length === expectedProducts,
  `Product total mismatch: ${products.length}`,
);

const collectionFields = `id legacyResourceId title handle description descriptionHtml image { ${imageFields} } sortOrder updatedAt templateSuffix seo { title description } productsCount { count precision } products(first: 50, sortKey: COLLECTION_DEFAULT) { ${connection('id handle')} }`;
const collections = [];
after = null;
do {
  const data = await query(
    'collections',
    `query Collections($after: String) { collections(first: 5, after: $after, sortKey: ID) { ${connection(collectionFields)} } }`,
    { after },
  );
  const batch = data.collections;
  for (const collection of batch.nodes) {
    collection.products = await completeConnection(
      collection.products,
      async (cursor) => {
        const result = await query(
          'collection-products',
          `query CollectionProducts($id: ID!, $after: String!) { collection(id: $id) { products(first: 250, after: $after, sortKey: COLLECTION_DEFAULT) { ${connection('id handle')} } } }`,
          { id: collection.id, after: cursor },
        );
        return result.collection.products;
      },
      `${collection.handle}.products`,
    );
    assert(
      collection.productsCount.precision === 'EXACT' &&
        collection.products.length === collection.productsCount.count,
      `Collection product count mismatch: ${collection.handle}`,
    );
    collections.push(collection);
  }
  console.log(
    `Collections exported: ${collections.length}/${expectedCollections}`,
  );
  assert(
    !batch.pageInfo.hasNextPage ||
      (batch.pageInfo.endCursor && batch.pageInfo.endCursor !== after),
    'Collection cursor did not advance',
  );
  after = batch.pageInfo.hasNextPage ? batch.pageInfo.endCursor : null;
} while (after);
uniqueById(collections, 'collections');
assert(
  collections.length === expectedCollections,
  `Collection total mismatch: ${collections.length}`,
);

const productMap = new Map(products.map((p) => [p.id, p]));
const collectionMap = new Map(collections.map((c) => [c.id, c]));
for (const collection of collections) {
  for (const product of collection.products) {
    assert(
      productMap.has(product.id),
      `Unknown product ${product.id} in collection ${collection.handle}`,
    );
    assert(
      productMap
        .get(product.id)
        .collections.some((c) => c.id === collection.id),
      `Membership mismatch for ${product.handle} in ${collection.handle}`,
    );
  }
}
for (const product of products) {
  for (const collection of product.collections) {
    assert(
      collectionMap.has(collection.id),
      `Unknown collection ${collection.id} on ${product.handle}`,
    );
    assert(
      collectionMap
        .get(collection.id)
        .products.some((p) => p.id === product.id),
      `Reverse membership mismatch for ${product.handle} in ${collection.handle}`,
    );
  }
}
const final = await query('postflight', preflightQuery);
verifyPreflight(final);
const summary = {
  products: products.length,
  collections: collections.length,
  variants: products.reduce((n, p) => n + p.variants.length, 0),
  images: products.reduce((n, p) => n + p.images.length, 0),
  media: products.reduce((n, p) => n + p.media.length, 0),
  collectionMemberships: collections.reduce((n, c) => n + c.products.length, 0),
  productStatuses: Object.fromEntries(
    ['ACTIVE', 'DRAFT', 'ARCHIVED'].map((status) => [
      status,
      products.filter((p) => p.status === status).length,
    ]),
  ),
};
const catalog = {
  source: {
    storeDomain: store,
    shop: before.shop,
    apiVersion,
    exportedAt: new Date().toISOString(),
    startedAt,
    method: 'Shopify CLI store execute; read-only read_products scope',
  },
  verification: {
    expectedProducts,
    expectedCollections,
    beforeCounts: {
      products: before.productsCount,
      collections: before.collectionsCount,
    },
    afterCounts: {
      products: final.productsCount,
      collections: final.collectionsCount,
    },
    allConnectionsExhausted: true,
    uniqueIdsChecked: true,
    bidirectionalMembershipChecked: true,
    collectionOrder: 'COLLECTION_DEFAULT',
    queryCount: queryNumber,
  },
  summary,
  products,
  collections,
};
const temporaryPath = join(dataDirectory, 'catalog.json.tmp');
await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`);
await rename(temporaryPath, join(dataDirectory, 'catalog.json'));
console.log(
  JSON.stringify(
    {
      path: join(dataDirectory, 'catalog.json'),
      ...summary,
      queryCount: queryNumber,
    },
    null,
    2,
  ),
);
