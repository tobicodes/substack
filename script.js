const axios = require('axios');
const cheerio = require('cheerio');

const selector = '[data-testid="post-preview-title"]'

async function getArchiveLinks() {
    const { data } = await axios.get('https://www.tobiwrites.com/archive');
    const $ = cheerio.load(data);
    const essayLinks = [];
    // replace 'a' and '.your-css-selector' with appropriate selectors for your webpage
    $(selector).each((i, link) => {
        essayLinks.push($(link).attr('href'));
    });
    return essayLinks;
}


async function runScript() {
    const results = {}
    const links = await getArchiveLinks()

    // Create an array of promises.
    const fetchPromises = links.map(fetchEssay)

    // Wait for all promises to resolve.
    const allResults = await Promise.all(fetchPromises)

    for (const result of allResults) {
        const {error, heading, content} = result
        if (!error) {
            results[heading] = content
            console.log(heading)
        } else {
            console.log(error)
        }
    }
}

async function fetchEssay(url) {
    try {
      if (!url) {
        return { heading: "", content: "", error: "URL is missing" };
      }
  
      const response = await fetch(url);
      const html = await response.text();
      const $ = cheerio.load(html);
  
      let content = "";
      let heading= "";
      let error= "";
  
      const publishedPost = $(".single-post");
  
      if (publishedPost.length) {
        content = publishedPost?.first()?.prop("innerText")?.trim();
        heading = $(".post-title")?.first()?.prop("innerText")?.trim();
      }  else {
        console.log("No matching content found.");
        error =
          "Hmmm no content found. Can you double check the URL? Make sure it's a Substack newsletter";
        heading = "";
        content = "";
      }
  
      const result = {
        heading: heading,
        content: content,
        error: error,
      };
      return result;
    } catch (error) {
      console.error("Error fetching essay:", error);
    }
  }
  

  
  runScript()