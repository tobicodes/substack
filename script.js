const axios = require("axios");
const cheerio = require("cheerio");
const { createParser } = require("eventsource-parser");
require("dotenv").config();

async function getArchiveLinks() {
  const selector = '[data-testid="post-preview-title"]';
  const { data } = await axios.get("https://www.tobiwrites.com/archive");
  const $ = cheerio.load(data);
  const essayLinks = [];

  $(selector).each((i, link) => {
    essayLinks.push($(link).attr("href"));
  });
  return essayLinks;
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
    let heading = "";
    let error = "";

    const publishedPost = $(".single-post");

    if (publishedPost.length) {
      content = publishedPost?.first()?.prop("innerText")?.trim();
      heading = $(".post-title")?.first()?.prop("innerText")?.trim();
    } else {
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

async function OpenAIStream(payload) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let counter = 0;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY ?? ""}`,
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  console.log("RES", res);

  const stream = new ReadableStream({
    async start(controller) {
      function onParse(event) {
        if (event.type === "event") {
          const data = event.data;
          // https://beta.openai.com/docs/api-reference/completions/create#completions/create-stream
          if (data === "[DONE]") {
            controller.close();
            return;
          }
          try {
            const json = JSON.parse(data);
            const text = json.choices[0].delta?.content || "";
            // TODO double-check the coutner logic

            if (counter < 2 && (text.match(/\n/) || []).length) {
              // this is a prefix character (i.e., "\n\n"), do nothing
              return;
            }
            const queue = encoder.encode(text);
            controller.enqueue(queue);
            counter++;
          } catch (e) {
            // TODO parse and handle error
            controller.error(e);
          }
        }
      }

      // stream response (SSE) from OpenAI may be fragmented into multiple chunks
      // this ensures we properly read chunks and invoke an event for each SSE event stream
      const parser = createParser(onParse);
      // https://web.dev/streams/#asynchronous-iteration
      for await (const chunk of res.body) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });
  return stream;
}

async function runScript() {
  const results = {};
  const links = await getArchiveLinks();

  const fetchPromises = links.map(fetchEssay);

  const allResults = await Promise.all(fetchPromises);

  for (const result of allResults) {
    const { error, heading, content } = result;
    if (!error) {
      results[heading] = content;
      console.log(heading);
    } else {
      console.log(error);
    }
  }

  // CALL GPT-4
  let string = "";
  for (const [key, value] of Object.entries(results).slice(0, 2)) {
    string += `${key}: ${value}`;
  }

  console.log(string);
  const request = `For these essays, describe the author tone, vibe, mood and style. Suggest a few paid newsletter outlets the author can send these essays to for paid contributsions: ${string}`;

  const essayPayload = {
    model: "gpt-4",
    messages: [{ role: "user", content: request }],
    temperature: 0.8,
    top_p: 1,
    max_tokens: 250,
    stream: true,
    n: 1,
  };

  const stream = await OpenAIStream(essayPayload);
  const allData = await readAllDataFromStream(stream);

  console.log(allData);
}

async function readAllDataFromStream(stream) {
  let decoder = new TextDecoder("utf-8");
  let allData = "";
  for await (const chunk of stream) {
    let result = decoder.decode(chunk);
    allData += result;
  }
  return allData;
}

runScript();
