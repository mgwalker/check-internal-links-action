import cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";
import core from "@actions/core";

const exists = async (path) => {
  try {
    await fs.access(path);
    return true;
  } catch (e) {
    return false;
  }
};

const getFiles = async (root) => {
  const fsChildren = await fs.readdir(root);

  const files = [];
  for await (const child of fsChildren) {
    const full = path.join(root, child);
    const stat = await fs.lstat(full);

    if (stat.isFile()) {
      files.push(full);
    } else if (stat.isDirectory()) {
      files.push(...(await getFiles(full)));
    }
  }

  return files.filter((file) => file.endsWith(".html"));
};

const getDom = async (file) => {
  const html = await fs.readFile(file, { encoding: "utf-8" });
  const dom = cheerio.load(html);

  const redirect = dom('meta[http-equiv="refresh"]').get().pop();
  if (redirect) {
    return false;
  }

  return dom;
};

const run = async () => {
  const SITE_ROOT = core.getInput("path");

  if (!SITE_ROOT) {
    core.error("Missing argument: path to scan for links");
    process.exit(3);
  } else if (!(await exists(SITE_ROOT))) {
    core.error(`Invalid argument: ${SITE_ROOT} is not found`);
    process.exit(2);
  }

  const files = await getFiles(SITE_ROOT);

  const pagesMap = new Map();

  for await (const file of files) {
    const dom = await getDom(file);
    if (dom) {
      const ids = dom("[id]")
        .map(function () {
          return dom(this).attr("id");
        })
        .get();

      const links = dom(
        "img[src], a[href], iframe[src], link[href], script[src]"
      )
        .map(function () {
          return dom(this).attr("src") ?? dom(this).attr("href");
        })
        .get()
        .filter((url) => /^[#\/]/.test(url))
        // The /admin/ page is populated dynamically by Netlify, so those links
        // are never "there" at build time. Don't test for them.
        .filter((url) => !/\/admin\//i.test(url));

      pagesMap.set(file, { ids, links });
    }
  }

  const errors = new Map();

  for (const [page, { ids, links }] of pagesMap) {
    errors.set(page, []);

    for (const link of links) {
      if (link.trim() === "") {
        errors.get(page).push(`href is empty`);
      } else if (link.startsWith("/")) {
        const url = new URL(link, "https://18f.gov");
        const pathComponents = [SITE_ROOT];

        pathComponents.push(url.pathname.replace(process.env.BASEURL, ""));

        // If the link does not include a file path, append index.html
        if (!/\.[a-z]+/i.test(url.pathname)) {
          pathComponents.push("index.html");
        }

        const filePath = path.join(...pathComponents);

        const targetFileExists = await exists(filePath);
        if (targetFileExists) {
          if (url.hash) {
            const targetId = url.hash.replace(/^#/, "");
            const targetHashExists = pagesMap
              .get(filePath)
              .ids.includes(targetId);

            if (!targetHashExists) {
              errors
                .get(page)
                .push(`link to ${link} - target hash does not exist`);
            }
          }
        } else {
          errors.get(page).push(`link to ${link}: target file does not exist`);
        }
      } else {
        const targetId = link.replace(/^#/, "");
        const targetHashExists = ids.includes(targetId.toLowerCase());

        if (!targetHashExists) {
          errors.get(page).push(`link to ${link} - target hash does not exist`);
        }
      }
    }
  }

  const write = async (str) => {
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.writeFile(process.env.GITHUB_STEP_SUMMARY, str, {
        encoding: "utf-8",
      });
    }
    console.log(str);
  };

  const errorMessages = [];
  errorMessages.push(
    `## 🛑 Checked ${pagesMap.size} pages and found these invalid or broken internal links:`,
    ""
  );

  for (const [page, pageErrors] of errors) {
    if (pageErrors.length) {
      errorMessages.push(`* ${page}  `);
      for (const error of pageErrors) {
        errorMessages.push(`   ${error}`);
        core.error({ title: error });
      }
    }
  }

  if (errorMessages.length > 2) {
    await write(errorMessages.join("\n"));
    process.exit(1);
  } else {
    await write(
      `✅ Checked ${pagesMap.size} pages and found no invalid or broken internal links`
    );
  }
};

run();
