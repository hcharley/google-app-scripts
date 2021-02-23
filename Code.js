const availableLocalesKey = 'AVAILABLE_LOCALES';
const localeNameKey = 'LOCALE_NAME';
/**
 * The event handler triggered when installing the add-on.
 * @param {Event} e The onInstall event.
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * The event handler triggered when opening the document.
 * @param {Event} e The onOpen event.
 *
 * This adds a "Webiny" menu option.
 */
function onOpen(e) {
  // display sidebar
  DocumentApp.getUi()
    .createMenu('Webiny')
    .addItem('Publishing Tools', 'showSidebar')
    .addItem('Administrator Tools', 'showSidebarManualAssociate')
    .addToUi();
}

/**
 * Displays a sidebar with Webiny integration stuff TBD
 */
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Page')
    .setTitle('CMS Integration')
    .setWidth(300);
  DocumentApp.getUi() // Or DocumentApp or SlidesApp or FormApp.
    .showSidebar(html);
}

/**
 * Displays a sidebar letting you manually associate this doc with an article
 * in Webiny.
 */
function showSidebarManualAssociate() {
  var html = HtmlService.createHtmlOutputFromFile('ManualPage')
    .setTitle('CMS Integration')
    .setWidth(300);
  DocumentApp.getUi() // Or DocumentApp or SlidesApp or FormApp.
    .showSidebar(html);
}

//
// Utility functions
//

// get unique values from an array
// from https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates?answertab=votes#tab-top
function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}


/**
 * Gets the title of the article from the name of the Google Doc
 */
function getDocumentName() {
  var headline = DocumentApp.getActiveDocument().getName();
  return headline;
}

/*
.* for now this only trims whitespace, but stands to allow for any other text cleaning up we may need
.*/
function cleanContent(content) {
  if (content === null || typeof(content) === 'undefined') {
    return "";
  }
  return content.trim();
}

/*
.* condenses text style into one object allowing for bold, italic and underline
.* google docs style attribute often contains unrelated info, sometimes even the text content
.*/
function cleanStyle(incomingStyle) {
  var cleanedStyle = {
    underline: incomingStyle.underline,
    bold: incomingStyle.bold,
    italic: incomingStyle.italic
  }
  return cleanedStyle;
}

// Generates a slug for the article based on its headline
// NOTE: this was generating a slug with category + headline, but nextjs routing doesn't work with a slash in the slug :-/
function createArticleSlug(category, headline) {
  var hedSlug;
  if (headline !== null && headline.trim() !== "") {
    hedSlug = slugify(headline);
  }
  return hedSlug;
}

// Implementation from https://gist.github.com/codeguy/6684588
// takes a regular string and returns a slug
function slugify(value) {
  if (value === null || typeof(value) === 'undefined') {
    return "";
  }
  value = value.trim();
  value = value.toLowerCase();
  var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
  var to   = "aaaaeeeeiiiioooouuuunc------";
  for (var i=0, l=from.length ; i<l ; i++) {
    value = value.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
  }

  value = value.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
      .replace(/\s+/g, '-') // collapse whitespace and replace by -
      .replace(/-+/g, '-'); // collapse dashes

  return value;
}

/*
.* This uploads an image in the Google Doc to S3
.* destination URL determined by: Organization Name, Article Title, and image ID
.*/
function uploadImageToS3(imageID, contentUri) {
  var scriptConfig = getScriptConfig();
  var AWS_ACCESS_KEY_ID = scriptConfig['AWS_ACCESS_KEY_ID'];
  var AWS_SECRET_KEY = scriptConfig['AWS_SECRET_KEY'];
  var AWS_BUCKET = scriptConfig['AWS_BUCKET'];

  var orgName = getOrganizationName();
  var orgNameSlug = slugify(orgName);
  var articleSlug = getArticleSlug();

  var objectName = "image" + imageID + ".png";

  // get the image data from google first
  var imageData = null;
  var res = UrlFetchApp.fetch(contentUri, {headers: {Authorization: "Bearer " + ScriptApp.getOAuthToken()}, muteHttpExceptions: true});
  if (res.getResponseCode() == 200) {
    imageData = res.getBlob(); //.setName("image1");
  } else {
    Logger.log("Failed to fetch image data for uri: ", contentUri);
    return null;
  }

  var destinationPath = orgNameSlug + "/" + articleSlug + "/" + objectName;
  var s3;

  try {
    s3 = getInstance(AWS_ACCESS_KEY_ID, AWS_SECRET_KEY);
  } catch (e) {
    Logger.log("Failed getting S3 instance: ", e)
  }

  try {
    s3.putObject(AWS_BUCKET, destinationPath, imageData, {logRequests:false});
  } catch (e) {
    Logger.log("Failed putting object: ", e)
  }
  var s3Url = "http://" + AWS_BUCKET + ".s3.amazonaws.com/" + destinationPath;
  return s3Url;
}

//
// Data storage functions
//

/*

.* Gets the script configuration, data available to all users and docs for this add-on
.*/
function getScriptConfig() {

  // look up org name on this document (scoped doc properties) in case we've figured it out before
  var orgName = getOrganizationName();

  // otherwise, locate the folder that contains 'articles' or 'pages' - it should be
  // named for the organisation; for example: 'oaklyn' > 'articles' > 'Article Document'
  if (orgName === null) {
    var documentID = DocumentApp.getActiveDocument().getId();
    var driveFile = DriveApp.getFileById(documentID)
    var fileParents = driveFile.getParents();
    while ( fileParents.hasNext() ) {
      var folder = fileParents.next();
      if (folder.getName() === 'articles' || folder.getName() === 'pages') {
        var folderParents = folder.getParents();
        while ( folderParents.hasNext() ) {
          var grandFolder = folderParents.next();
          orgName = grandFolder.getName();
          storeOrganizationName(orgName);
        }
      }
    }
  }

  // If there's still no org name return an error
  if (orgName === null) {
    return { "status": "error", "message": "Failed to find an organization name; check the folder structure." }
  }

  var scriptProperties = PropertiesService.getScriptProperties();
  var data = scriptProperties.getProperties();
  var orgData = {}
  var pattern = `^${orgName}_`;
  var orgKeyRegEx = new RegExp(pattern, "i")
    // value = value.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
  for (var key in data) {
    if (orgKeyRegEx.test(key)) {
      var plainKey = key.replace(orgKeyRegEx, '');
      orgData[plainKey] = data[key];
    }
  }
  return orgData;
}

/*
.* Sets script-wide configuration
.*/
function setScriptConfig(data) {
  var orgName = getOrganizationName();
  if (orgName === null) {
    return { "status": "error", "message": "Failed to find an organization name; check the folder structure." }
  }
  var scriptProperties = PropertiesService.getScriptProperties();
  for (var key in data) {
    var orgKey = orgName + "_" + key;
    // (orgKey, "=>", data[key]);
    scriptProperties.setProperty(orgKey, data[key]);
  }
  return { status: "success", message: "Saved configuration." };
}

/*

.* general purpose function (called in the other data storage functions) to retrieve a value for a key
.*/
function getValue(key) {
  var documentProperties = PropertiesService.getDocumentProperties();
  var value = documentProperties.getProperty(key);
  return value;
}

function getValueJSON(key) {
  var valueString = getValue(key);
  var value = [];
  if (valueString && valueString !== null) {
    try {
      value = JSON.parse(valueString);
    } catch(e) {
      Logger.log("error parsing JSON: ", e)
      value = []
    }
  }
  return value;
}

/*
.* general purpose function (called in the other data storage functions) to set a value at a key
.*/
function storeValue(key, value) {
  var documentProperties = PropertiesService.getDocumentProperties();
  documentProperties.setProperty(key, value);
}

function storeValueJSON(key, value) {
  var valueString;
  try {
    valueString = JSON.stringify(value);
  } catch(e) {
    Logger.log("error stringify-ing data: ", e)
    valueString = JSON.stringify([]);
  }
  storeValue(key, valueString);
}

function deleteAllValues() {
  var documentPropertiesService = PropertiesService.getDocumentProperties();
  var allDocumentProperties = documentPropertiesService.getProperties();
  for (var key in allDocumentProperties) {
    documentPropertiesService.deleteProperty(key);
  }
  var documentPropertiesServiceAfter = PropertiesService.getDocumentProperties();
  var allDocumentPropertiesAfter = documentPropertiesServiceAfter.getProperties();
  return allDocumentPropertiesAfter;
}

function deleteValue(key) {
  var documentProperties = PropertiesService.getDocumentProperties();
  documentProperties.deleteProperty(key);
}

function getOrganizationName() {
  return getValue("ORG_NAME");
}

function storeOrganizationName(value) {
  storeValue("ORG_NAME", value);
}

/**
 * Retrieves the ID of the article from the local document storage
 */
function getArticleID() {
  var documentProperties = PropertiesService.getDocumentProperties();
  var storedArticleID = documentProperties.getProperty('ARTICLE_ID');
  return storedArticleID;
}

/**
 * Stores the ID of the article in the local document storage
 */
function storeArticleID(articleID) {
  var documentProperties = PropertiesService.getDocumentProperties();
  documentProperties.setProperty('ARTICLE_ID', articleID);
}

/**
 * Deletes the articleID
 * this is used when deleting the article from webiny
 */
function deleteArticleID() {
  deleteValue('ARTICLE_ID');
}

function getIsPublished() {
  var value = getValue('IS_PUBLISHED');
  if (value === "true" || value === true) {
    return true;
  } else {
    return false
  }
}

function storeIsPublished(value) {
  storeValue("IS_PUBLISHED", value);
}

/**
 * Retrieves the ID of the document's locale from local doc storage
 */
function getLocaleID() {
  return getValue('LOCALE_ID');
}

/**
 * Stores the ID of the locale in the local doc storage
 * @param localeID webiny ID for the doc's locale
 */
function storeLocaleID(localeID) {
  storeValue('LOCALE_ID', localeID);
}

function getSelectedLocaleName() {
  var value = getValue(localeNameKey);
  return value;
}

function storeSelectedLocaleName(localeName) {
  storeValue(localeNameKey, localeName);
}

function getAvailableLocales() {
  var value = getValue(availableLocalesKey)
  return value;
}

function storeAvailableLocales(localesString) {
  storeValue(availableLocalesKey, localesString);
}

function getArticleSlug() {
  return getValue('ARTICLE_SLUG');
}  

function storeArticleSlug(slug) {
  storeValue("ARTICLE_SLUG", slug);
}

function deleteArticleSlug() {
  deleteValue('ARTICLE_SLUG');
}

function getCustomByline() {
  return getValue('ARTICLE_CUSTOM_BYLINE');
}

function storeCustomByline(customByline) {
  storeValue("ARTICLE_CUSTOM_BYLINE", customByline);
}

function getByline() {
  return getValue('ARTICLE_BYLINE');
}

function storeByline(byline) {
  storeValue("ARTICLE_BYLINE", byline);
}

function getHeadline() {
  return getValue('ARTICLE_HEADLINE');
}

function storeHeadline(headline) {
  storeValue("ARTICLE_HEADLINE", headline);
}

function getCategoryID() {
  return getValue('ARTICLE_CATEGORY_ID');
}

function storeCategoryID(categoryID) {
  storeValue("ARTICLE_CATEGORY_ID", categoryID)
}

function getCategories() {
  return getValueJSON('ALL_CATEGORIES');
}

function storeCategories(categories) {
  storeValueJSON('ALL_CATEGORIES', categories);
}

function getNameForCategoryID(categories, categoryID) {
  var result = categories.find( ({ id }) => id === categoryID );
  if (typeof(result) !== 'undefined' && result.title && result.title.values && result.title.values[0] && result.title.values[0].value) {
    return result.title.values[0].value;
  } else {
    return null;
  }
}

function storePublishingInfo(info) {
  storeValue("PUBLISHING_INFO", JSON.stringify(info));
}

function generatePublishDate() {
  let pubDate = new Date();
  let pubDateString = pubDate.toISOString();
  return pubDateString;
}

function getPublishingInfo() {
  var publishingInfo = JSON.parse(getValue("PUBLISHING_INFO"));
  if (publishingInfo === null) {
    publishingInfo = {};
  }
  return publishingInfo;
}

function storeImageList(imageList) {
  storeValue("IMAGE_LIST", JSON.stringify(imageList));
}

function getImageList() {
  var imageList = JSON.parse(getValue("IMAGE_LIST"));
  if (imageList === null) {
    imageList = {};
  }
  return imageList;
}

/**
 * Deletes the article's publishing info
 * this is used when deleting the article from webiny
 */
function deletePublishingInfo() {
  deleteValue('PUBLISHING_INFO');
}

function deleteTags() {
  deleteValue('ARTICLE_TAGS');
}

function deleteCategories() {
  deleteValue('ARTICLE_CATEGORY_ID');
  return deleteValue('ALL_CATEGORIES');
}

// space delimited string of author slugs
function getAuthorSlugs() {
  return getValue('ARTICLE_AUTHOR_SLUGS');
}

// space delimited string of author slugs
function storeAuthorSlugs(authorSlugs) {
  storeValue("ARTICLE_AUTHOR_SLUGS", authorSlugs);
}

// array of author data
function getAuthors() {
  return getValueJSON('ARTICLE_AUTHORS');
}

// array of author data
function storeAuthors(authors) {
  if (authors === undefined) {
    return;
  }
  var allAuthors = getAllAuthors(); // don't request from the DB again - too slow
  var storableAuthors = [];

  // the form in the sidebar sends a string with a single ID when one author is selected 
  // **argh**
  // this hack addresses that issue
  if (typeof(authors) === 'string') {
    authors = [authors];
  }

  // try to find id and name of each author to store full data
  authors.forEach(author => {
    var authorID;
    if (typeof(author) === 'object') {
      authorID = author.id;
    } else {
      authorID = author;
    }
    var result = allAuthors.find( ({ id }) => id === authorID );
    if (result !== undefined) {
      storableAuthors.push({
        id: result.id,
        newAuthor: false,
        name: result.name.value
      });
    }
  })

  storeValueJSON("ARTICLE_AUTHORS", storableAuthors);
}

function getAllAuthors() {
  return getValueJSON('ALL_AUTHORS');
}

function storeAllAuthors(authors) {
  return storeValueJSON('ALL_AUTHORS', authors);
}

function getTags() {
  return getValueJSON('ARTICLE_TAGS');
}

function getAllTags() {
  return getValueJSON('ALL_TAGS');
}

function storeAllTags(tags) {
  return storeValueJSON('ALL_TAGS', tags);
}

function storeTags(tags) {
  if (tags === undefined) {
    return;
  }
  var allTags = getAllTags(); // don't request from the DB again - too slow
  var storableTags = [];

  // the form in the sidebar sends a string with a single ID when one tag is selected 
  // **argh**
  // this hack addresses that issue
  if (typeof(tags) === 'string') {
    tags = [tags];
  }

  // try to find id and title of tag to store full data
  tags.forEach(tag => {
    var tagID;
    if (typeof(tag) === 'object') {
      tagID = tag.id;
    } else {
      tagID = tag;
    }
    var result = allTags.find( ({ id }) => id === tagID );
    if (result !== undefined) {
      storableTags.push({
        id: result.id,
        newTag: false,
        title: result.title.value
      });
    // treat this as a new tag
    } else {
      storableTags.push({
        id: null,
        newTag: true,
        title: tag
      });
    }
  })

  storeValueJSON("ARTICLE_TAGS", storableTags);
}

function getSEO() {
  seoValue = getValueJSON('ARTICLE_SEO');
  if (seoValue === null || seoValue.length <= 0) {
    seoValue = {
      searchTitle: "",
      searchDescription: "",
      facebookTitle: "",
      facebookDescription: "",
      twitterTitle: "",
      twitterDescription: ""
    }
  }
  return seoValue;
}

function storeSEO(seoData) {
  storeValueJSON("ARTICLE_SEO", seoData);
}

function deleteSEO() {
  deleteValue("ARTICLE_SEO")
}

function storeDocumentType(value) {
  storeValue('DOCUMENT_TYPE', value);
}

function getDocumentType() {
  var val = getValue('DOCUMENT_TYPE');
  return val;
}

async function fetchGraphQL(operationsDoc, operationName, variables) {
  var scriptConfig = getScriptConfig();
  var ORG_SLUG = scriptConfig['ACCESS_TOKEN'];
  var API_URL = scriptConfig['CONTENT_API'];

  var options = {
    method: 'POST',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      "TNC-Organization": ORG_SLUG
    },
    payload: JSON.stringify({
      query: operationsDoc,
      variables: variables,
      operationName: operationName
    }),
  };

  const result = await UrlFetchApp.fetch(
    API_URL,
    options
  );

  var responseText = result.getContentText();
  var responseData = JSON.parse(responseText);

  return responseData;
}

const lookupArticleByGoogleDocQuery = `query MyQuery($document_id: String) {
  article_google_documents(where: {google_document: {document_id: {_eq: $document_id}}}) {
    google_document {
      document_id
      locale_code
      id
      organization_id
      url
    }
    article {
      slug
      created_at
      updated_at
    }
  }
}`;

const insertPageGoogleDocsMutation = `mutation MyMutation($slug: String!, $locale_code: String!, $document_id: String, $url: String, $facebook_title: String, $facebook_description: String, $search_title: String, $search_description: String, $headline: String, $twitter_title: String, $twitter_description: String, $content: jsonb, $published: Boolean) {
  insert_pages(objects: {page_google_documents: {data: {google_document: {data: {document_id: $document_id, locale_code: $locale_code, url: $url}, on_conflict: {constraint: google_documents_organization_id_document_id_key, update_columns: document_id}}}, on_conflict: {constraint: page_google_documents_page_id_google_document_id_key, update_columns: google_document_id}}, slug: $slug, page_translations: {data: {published: $published, search_description: $search_description, search_title: $search_title, twitter_description: $twitter_description, twitter_title: $twitter_title, locale_code: $locale_code, headline: $headline, facebook_title: $facebook_title, facebook_description: $facebook_description, content: $content}}}, on_conflict: {constraint: pages_slug_organization_id_key, update_columns: updated_at}) {
    returning {
      id
      slug
      page_google_documents {
        id
        google_document {
          document_id
          locale_code
          url
        }
      }
    }
  }
}`;

const upsertPublishedArticleTranslationMutation = `mutation MyMutation($article_id: Int = 10, $article_translation_id: Int = 10, $locale_code: String = "") {
  insert_published_article_translations(objects: {article_id: $article_id, article_translation_id: $article_translation_id, locale_code: $locale_code}, on_conflict: {constraint: published_article_translations_article_id_locale_code_key, update_columns: article_translation_id}) {
    affected_rows
    returning {
      article_translation {
        id
        first_published_at
        last_published_at
        locale_code
        article_id
      }
    }
  }
}`;

const insertArticleGoogleDocMutation = `mutation MyMutation($locale_code: String!, $headline: String!, $published: Boolean, $category_id: Int!, $slug: String!, $document_id: String, $url: String, $custom_byline: String, $content: jsonb, $facebook_description: String, $facebook_title: String, $search_description: String, $search_title: String, $twitter_description: String, $twitter_title: String) {
  insert_articles(objects: {article_translations: {data: {headline: $headline, locale_code: $locale_code, published: $published, content: $content, custom_byline: $custom_byline, facebook_description: $facebook_description, facebook_title: $facebook_title, search_description: $search_description, search_title: $search_title, twitter_description: $twitter_description, twitter_title: $twitter_title}}, category_id: $category_id, slug: $slug, article_google_documents: {data: {google_document: {data: {document_id: $document_id, locale_code: $locale_code, url: $url}, on_conflict: {constraint: google_documents_organization_id_document_id_key, update_columns: locale_code}}}, on_conflict: {constraint: article_google_documents_article_id_google_document_id_key, update_columns: google_document_id}}}, on_conflict: {constraint: articles_slug_category_id_organization_id_key, update_columns: updated_at}) {
    returning {
      id
      slug
      updated_at
      created_at
      article_google_documents {
        id
        google_document {
          document_id
          locale_code
          url
          id
        }
      }
      category {
        slug
      }
      article_translations(where: { locale_code: {_eq: $locale_code}}, order_by: {id: desc}, limit: 1) {
        id
        article_id
        locale_code
        published
      }
      published_article_translations(where: {locale_code: {_eq: $locale_code}}) {
        article_translation {
          id
          first_published_at
          last_published_at
          locale_code
        }
      }
    }
  }
}`;

function insertPageGoogleDocs(data) {
  var documentID = DocumentApp.getActiveDocument().getId();
  var documentURL = DocumentApp.getActiveDocument().getUrl();
  var content = getCurrentDocContents();

  let pageData = {
    "slug": data['article-slug'],
    "document_id": documentID,
    "url": documentURL,
    "locale_code": data['article-locale'],
    "headline": data['article-headline'],
    "published": data['published'],
    "content": content,
    "search_description": data['article-search-description'],
    "search_title": data['article-search-title'],
    "twitter_title": data['article-twitter-title'],
    "twitter_description": data['article-twitter-description'],
    "facebook_title": data['article-facebook-title'],
    "facebook_description": data['article-facebook-description'],
  };
  Logger.log("page data:" + JSON.stringify(pageData));
  return fetchGraphQL(
    insertPageGoogleDocsMutation,
    "MyMutation",
    pageData
  );
}

function upsertPublishedArticle(articleId, translationId, localeCode) {
  return fetchGraphQL(
    upsertPublishedArticleTranslationMutation,
    "MyMutation",
    {
      article_id: articleId,
      locale_code: localeCode,
      article_translation_id: translationId
    }
  );
}

function insertArticleGoogleDocs(data) {
  var documentID = DocumentApp.getActiveDocument().getId();
  var documentURL = DocumentApp.getActiveDocument().getUrl();
  var content = getCurrentDocContents();

  let articleData = {
    "slug": data['article-slug'],
    "document_id": documentID,
    "url": documentURL,
    "category_id": data['article-category'],
    "locale_code": data['article-locale'],
    "headline": data['article-headline'],
    "published": data['published'],
    "content": content,
    "search_description": data['article-search-description'],
    "search_title": data['article-search-title'],
    "twitter_title": data['article-twitter-title'],
    "twitter_description": data['article-twitter-description'],
    "facebook_title": data['article-facebook-title'],
    "facebook_description": data['article-facebook-description'],
    "custom_byline": data['article-custom-byline'],
  };

  return fetchGraphQL(
    insertArticleGoogleDocMutation,
    "MyMutation",
    articleData
  );
}

const insertAuthorPageMutation = `mutation MyMutation($page_id: Int!, $author_id: Int!) {
  insert_author_pages(objects: {page_id: $page_id, author_id: $author_id}, on_conflict: {constraint: author_pages_page_id_author_id_key, update_columns: page_id}) {
    affected_rows
  }
}`;

async function hasuraCreateAuthorPage(authorId, pageId) {
  return fetchGraphQL(
    insertAuthorPageMutation,
    "MyMutation",
    {
      page_id: pageId,
      author_id: authorId
    }
  );
}

const insertAuthorArticleMutation = `mutation MyMutation($article_id: Int!, $author_id: Int!) {
  insert_author_articles(objects: {article_id: $article_id, author_id: $author_id}, on_conflict: {constraint: author_articles_article_id_author_id_key, update_columns: article_id}) {
    affected_rows
  }
}`;

async function hasuraCreateAuthorArticle(authorId, articleId) {
  return fetchGraphQL(
    insertAuthorArticleMutation,
    "MyMutation",
    {
      article_id: articleId,
      author_id: authorId
    }
  );
}

const insertGoogleDocMutation = `mutation MyMutation($article_id: Int!, $document_id: String!, $locale_code: String!, $url: String) {
  insert_article_google_documents(objects: {article_id: $article_id, google_document: {data: {document_id: $document_id, locale_code: $locale_code, url: $url}, on_conflict: {constraint: google_documents_organization_id_document_id_key, update_columns: url}}}, on_conflict: {constraint: article_google_documents_article_id_google_document_id_key, update_columns: google_document_id}) {
    affected_rows
  }
}`;

async function hasuraInsertGoogleDoc(articleId, docId, localeCode, url) {
  return fetchGraphQL(
    insertGoogleDocMutation,
    "MyMutation",
    {
      article_id: articleId,
      document_id: docId,
      locale_code: localeCode,
      url: url
    }
  );
}
async function hasuraCreateDoc(articleId, newLocale, headline) {
  Logger.log("create new doc for article " + articleId + " and locale " + newLocale);
  // create new document in google docs
  var currentDocId = DocumentApp.getActiveDocument().getId();
  var newDocId;
  var newDocUrl;
  var localisedHeadline = newLocale + " - " + headline;
  var driveFile = DriveApp.getFileById(currentDocId);
  var newFile = driveFile.makeCopy(localisedHeadline);
  if (newFile) {
    newDocId = newFile.getId();
    newDocUrl = newFile.getUrl();
  } else {
    Logger.log("failed creating new file via DriveApp")
    return null;
  }

  // insert new document ID in google_documents table with newLocale & articleID
  var response = await hasuraInsertGoogleDoc(articleId, newDocId, newLocale, newDocUrl);
  Logger.log("hasura insert googleDoc response: " + JSON.stringify(response));

  // return new doc ID / url for link?

  return {
    articleId: articleId,
    locale: newLocale,
    docId: newDocId,
    url: newDocUrl,
    data: response
  }
}

const unpublishArticleMutation = `mutation MyMutation($article_id: Int!, $locale_code: String!) {
  update_article_translations(where: {article_id: {_eq: $article_id}, locale_code: {_eq: $locale_code}}, _set: {published: false}) {
    affected_rows
  }
}`;

async function hasuraUnpublishArticle(articleId, localeCode) {
  return fetchGraphQL(
    unpublishArticleMutation,
    "MyMutation",
    {
      article_id: articleId,
      locale_code: localeCode
    }
  );
}

const insertTagMutation = `mutation MyMutation($slug: String, $locale_code: String, $title: String, $article_id: Int!) {
  insert_tag_articles(objects: {article_id: $article_id, tag: {data: {slug: $slug, tag_translations: {data: {locale_code: $locale_code, title: $title}, on_conflict: {constraint: tag_translations_tag_id_locale_code_key, update_columns: locale_code}}, published: true}, on_conflict: {constraint: tags_organization_id_slug_key, update_columns: organization_id}}}, on_conflict: {constraint: tag_articles_article_id_tag_id_key, update_columns: article_id}) {
    returning {
      id
      article_id
      tag_id
    }
  }
}`;

async function hasuraCreateTag(tagData) {
  return fetchGraphQL(
    insertTagMutation,
    "MyMutation",
    tagData
  );
}

async function hasuraHandleUnpublish(articleID, localeCode) {
  var response = await hasuraUnpublishArticle(articleID, localeCode);
  Logger.log("hasura unpublish response: " + JSON.stringify(response));
  var returnValue = {
    status: "success",
    message: "Unpublished the article with id " + articleID + " in locale " + localeCode,
    data: response
  };
  if (response.errors) {
    returnValue.status = "error";
    returnValue.message = "An unexpected error occurred trying to unpublish the article";
    returnValue.data = response.errors;
  }
  return returnValue;
}

async function hasuraHandlePublish(formObject) {
  var scriptConfig = getScriptConfig();
  Logger.log("formObject: " + JSON.stringify(formObject));

  var slug = formObject['article-slug'];
  var headline = formObject['article-headline'];

  if (headline === "" || headline === null || headline === undefined) {
    return {
      message: "Headline is required",
      status: "error",
      data: formObject
    }
  }

  if (slug === "" || slug === null || slug === undefined) {
    slug = slugify(headline)
    Logger.log("no slug found, generated from headline: " + headline + " -> " + slug)
    formObject['article-slug'] = slug;
  }

  // NOTE: this flag tells the insert mutation to mark this new translation record as PUBLISHED
  //   - this is set to false when the 'preview article' button is clicked instead.
  formObject['published'] = true;

  var data;

  var documentID = DocumentApp.getActiveDocument().getId();
  var isStaticPage = isPage(documentID);

  // construct published article url
  var publishUrl = scriptConfig['PUBLISH_URL'];
  var fullPublishUrl;
  var documentType;

  if (isStaticPage) {
    documentType = "page";
    // insert or update page
    var data = await insertPageGoogleDocs(formObject);
    Logger.log("pageResult: " + JSON.stringify(data))

    var pageID = data.data.insert_pages.returning[0].id;

    if (pageID && formObject['article-authors']) {
      var authors;
      // ensure this is an array; selecting one in the UI results in a string being sent
      if (typeof(formObject['article-authors']) === 'string') {
        authors = [formObject['article-authors']]
      } else {
        authors = formObject['article-authors'];
      }
      for (var index = 0; index < authors.length; index++) {
        var author = authors[index];
        var result = await hasuraCreateAuthorPage(author, pageID);
      }
    }
    if (formObject['article-locale']) {
      fullPublishUrl = publishUrl + "/" + formObject['article-locale'] + "/" + slug;
    } else {
      fullPublishUrl = publishUrl + "/" + slug;
    }
    Logger.log("fullPublishUrl: " + fullPublishUrl);

  } else {
    documentType = "article";
    // insert or update article
    var data = await insertArticleGoogleDocs(formObject);
    Logger.log("data: " + JSON.stringify(data))
    var articleID = data.data.insert_articles.returning[0].id;
    var categorySlug = data.data.insert_articles.returning[0].category.slug;
    var articleSlug = data.data.insert_articles.returning[0].slug;
    var translationID = data.data.insert_articles.returning[0].article_translations[0].id;

    if (articleID) {
      var publishedArticleData = await upsertPublishedArticle(articleID, translationID, formObject['article-locale'])
      if (publishedArticleData) {
        Logger.log("Published article data: " + JSON.stringify(publishedArticleData));
        Logger.log("Insert1: " + JSON.stringify(data.data.insert_articles.returning[0].published_article_translations));
        data.data.insert_articles.returning[0].published_article_translations = publishedArticleData.data.insert_published_article_translations.returning;
        Logger.log("Insert2: " + JSON.stringify(data.data.insert_articles.returning[0].published_article_translations));
      }
    }
    Logger.log("articleSlug: " + articleSlug + " || articleResult: " + JSON.stringify(data));
    if (articleID && formObject['article-tags']) {
      var tags;
      // ensure this is an array; selecting one in the UI results in a string being sent
      if (typeof(formObject['article-tags']) === 'string') {
        tags = [formObject['article-tags']]
      } else {
        tags = formObject['article-tags'];
      }
      for (var index = 0; index < tags.length; index++) {
        var tag = tags[index];
        var tagSlug = slugify(tag);
        var result = await hasuraCreateTag({
          slug: tagSlug, 
          title: tag,
          article_id: articleID,
          locale_code: formObject['article-locale']
        });
        Logger.log("create tag result:" + JSON.stringify(result))
      }
    }

    if (articleID && formObject['article-authors']) {
      var authors;
      // ensure this is an array; selecting one in the UI results in a string being sent
      if (typeof(formObject['article-authors']) === 'string') {
        authors = [formObject['article-authors']]
      } else {
        authors = formObject['article-authors'];
      }
      Logger.log("Found authors: " + JSON.stringify(authors));
      for (var index = 0; index < authors.length; index++) {
        var author = authors[index];
        var result = await hasuraCreateAuthorArticle(author, articleID);
      }
    }
    if (formObject['article-locale']) {
      fullPublishUrl = publishUrl + "/" + formObject['article-locale'] + "/articles/" + categorySlug + "/" + articleSlug;
    } else {
      fullPublishUrl = publishUrl + "/articles/" + categorySlug + "/" + articleSlug;
    }
    Logger.log("fullPublishUrl: " + fullPublishUrl);
  }

  // open preview url in new window
  var message = "Published the " + documentType + ". <a href='" + fullPublishUrl + "' target='_blank'>Click to view</a>."

  return {
    message: message,
    data: data,
    status: "success"
  }
}


async function hasuraHandlePreview(formObject) {
  var scriptConfig = getScriptConfig();
  Logger.log("formObject: " + JSON.stringify(formObject));

  var slug = formObject['article-slug'];
  var headline = formObject['article-headline'];

  if (headline === "" || headline === null || headline === undefined) {
    return {
      message: "Headline is required",
      status: "error",
      data: formObject
    }
  }

  if (slug === "" || slug === null || slug === undefined) {
    slug = slugify(headline)
    Logger.log("no slug found, generated from headline: " + headline + " -> " + slug)
    formObject['article-slug'] = slug;
  }

  // NOTE: this flag tells the insert mutation to mark this new translation record as UNPUBLISHED
  //   - this is set to true when the 'publish article' button is clicked instead.
  formObject['published'] = false;

  var data;

  var documentID = DocumentApp.getActiveDocument().getId();
  var isStaticPage = isPage(documentID);

  if (isStaticPage) {
    // insert or update page
    var data = await insertPageGoogleDocs(formObject);
    Logger.log("pageResult: " + JSON.stringify(data))

    var pageID = data.data.insert_pages.returning[0].id;

    if (pageID && formObject['article-authors']) {
      var authors;
      // ensure this is an array; selecting one in the UI results in a string being sent
      if (typeof(formObject['article-authors']) === 'string') {
        authors = [formObject['article-authors']]
      } else {
        authors = formObject['article-authors'];
      }
      Logger.log("Found authors: " + JSON.stringify(authors));
      for (var index = 0; index < authors.length; index++) {
        var author = authors[index];
        Logger.log("creating author page link: " + author + " -- " + pageID)
        var result = await hasuraCreateAuthorPage(author, pageID);
        Logger.log("create author page result:" + JSON.stringify(result))
      }
    }

  } else {
    // insert or update article
    var data = await insertArticleGoogleDocs(formObject);
    Logger.log("data: " + JSON.stringify(data));
    var articleID = data.data.insert_articles.returning[0].id;

    Logger.log("articleResult: " + JSON.stringify(data))
    if (articleID && formObject['article-tags']) {
      var tags;
      // ensure this is an array; selecting one in the UI results in a string being sent
      if (typeof(formObject['article-tags']) === 'string') {
        tags = [formObject['article-tags']]
      } else {
        tags = formObject['article-tags'];
      }
      Logger.log("Found tags: " + JSON.stringify(tags));
      for (var index = 0; index < tags.length; index++) {
        var tag = tags[index];
        var slug = slugify(tag);
        var result = await hasuraCreateTag({
          slug: slug, 
          title: tag,
          article_id: articleID,
          locale_code: formObject['article-locale']
        });
        Logger.log("create tag result:" + JSON.stringify(result))
      }
    }

    if (articleID && formObject['article-authors']) {
      var authors;
      // ensure this is an array; selecting one in the UI results in a string being sent
      if (typeof(formObject['article-authors']) === 'string') {
        authors = [formObject['article-authors']]
      } else {
        authors = formObject['article-authors'];
      }
      Logger.log("Found authors: " + JSON.stringify(authors));
      for (var index = 0; index < authors.length; index++) {
        var author = authors[index];
        var result = await hasuraCreateAuthorArticle(author, articleID);
      }
    }
  }

  //construct preview url
  var fullPreviewUrl = scriptConfig['PREVIEW_URL'] + "?secret=" + scriptConfig['PREVIEW_SECRET'] + "&slug=" + formObject['article-slug'] + "&locale=" + formObject['article-locale'];
  var message = "<a href='" + fullPreviewUrl + "' target='_blank'>Preview article in new window</a>";

  return {
    message: message,
    data: data,
    status: "success"
  }
}

const searchArticlesByHeadlineQuery = `query MyQuery($locale_code: String!, $term: String!) {
  articles(where: {article_translations: {headline: {_ilike: $term}, locale_code: {_eq: $locale_code}}}) {
    id
    slug
    category {
      slug
    }
    article_translations(where: {locale_code: {_eq: $locale_code}}) {
      headline
    }
  }
  organization_locales {
    locale {
      code
      name
    }
  }
}`;

const getPageForGoogleDocQuery = `query MyQuery($doc_id: String!, $locale_code: String!) {
  pages(where: {page_google_documents: {google_document: {document_id: {_eq: $doc_id}, locale_code: {_eq: $locale_code}}}, page_translations: {locale_code: {_eq: $locale_code}}}) {
    id
    slug
    page_translations(where: {locale_code: {_eq: $locale_code}}) {
      content
      facebook_description
      facebook_title
      first_published_at
      headline
      last_published_at
      locale_code
      published
      search_description
      search_title
      twitter_title
      twitter_description
    }
    author_pages {
      author {
        name
        id
        slug
      }
    }
  }
  authors {
    id
    slug
    name
  }
  organization_locales {
    locale {
      code
      name
    }
  }
}`;

const getArticleByGoogleDocQuery = `query MyQuery($doc_id: String!) {
  articles(where: {article_google_documents: {google_document: {document_id: {_eq: $doc_id}}}}) {
    id
    slug
    category {
      id
      slug
      title
    }
    author_articles {
      author {
        id
        name
        slug
      }
    }
    article_google_documents(where: {google_document: {document_id: {_eq: $doc_id}}}) {
      google_document {
        document_id
        locale_code
        url
      }
    }
  }
  authors {
    id
    slug
    name
  }
  organization_locales {
    locale {
      code
      name
    }
  }
}`;

function fetchArticleForGoogleDoc(doc_id) {
  return fetchGraphQL(
    getArticleByGoogleDocQuery,
    "MyQuery",
    {"doc_id": doc_id}
  );
}

function fetchPageForGoogleDoc(doc_id, locale_code) {
  return fetchGraphQL(
    getPageForGoogleDocQuery,
    "MyQuery",
    {"doc_id": doc_id, "locale_code": locale_code}
  );
}

/*
.* called from ManualPage.html, this function searches for a matching article by headline
.*/
function hasuraSearchArticles(formObject) {
  var localeCode = formObject["locale-code"];
  if (localeCode === undefined || localeCode === null) {
    localeCode = "en-US" // TODO should we default this way?
  }
  var term = "%" + formObject["article-search"] + "%";
  return fetchGraphQL(
    searchArticlesByHeadlineQuery,
    "MyQuery",
    {"term": term, "locale_code": localeCode}
  );
}

/*
 * looks up a page by google doc ID and locale
 */
async function getPageForGoogleDoc(doc_id, locale_code) {
  const { errors, data } = await fetchPageForGoogleDoc(doc_id, locale_code);

  if (errors) {
    console.error("errors:" + JSON.stringify(errors));
    throw errors;
  }

  return data;
}

const getArticleTranslationForIdAndLocale = `query MyQuery($doc_id: String!, $article_id: Int, $locale_code: String!) {
  article_translations(where: {article_id: {_eq: $article_id}, locale_code: {_eq: $locale_code}}, limit: 1, order_by: {id: desc}) {
    content
    custom_byline
    facebook_description
    facebook_title
    first_published_at
    headline
    id
    last_published_at
    locale_code
    published
    search_description
    search_title
    twitter_description
    twitter_title
  }

  articles(where: {article_google_documents: {google_document: {document_id: {_eq: $doc_id}}}}) {
    id
    slug
    category {
      id
      slug
      title
    }
    author_articles {
      author {
        id
        name
        slug
      }
    }
    article_google_documents(where: {google_document: {document_id: {_eq: $doc_id}}}) {
      google_document {
        document_id
        locale_code
        url
      }
    }
  }
  authors {
    id
    slug
    name
  }
  categories {
    id
    slug
    category_translations(where: {locale_code: {_eq: $locale_code}}) {
      title
    }
  }
  article_google_documents(where: {article_id: {_eq: $article_id}}) {
    google_document {
      document_id
      locale_code
      url
    }
    article_id
  }
  organization_locales {
    locale {
      code
      name
    }
  }
  tags {
    id
    slug
    tag_translations(where: {locale_code: {_eq: $locale_code}}) {
      title
    }
  }
  published_article_translations(where: {locale_code: {_eq: $locale_code}, article_id: {_eq: $article_id}}) {
    article_translation {
      id
      first_published_at
      last_published_at
      locale_code
    }
  }
}`

function fetchTranslationDataForArticle(docId, articleId, localeCode) {
  return fetchGraphQL(
    getArticleTranslationForIdAndLocale,
    "MyQuery",
    {"doc_id": docId, "article_id": articleId, "locale_code": localeCode}
  );
}

async function getTranslationDataForArticle(docId, articleId, localeCode) {
  const { errors, data } = await fetchTranslationDataForArticle(docId, articleId, localeCode);

  if (errors) {
    console.error("errors:" + JSON.stringify(errors));
    throw errors;
  }

  return data;
}

/*
 * looks up an article by google doc ID and locale
 */
async function getArticleForGoogleDoc(doc_id) {
  const { errors, data } = await fetchArticleForGoogleDoc(doc_id);

  if (errors) {
    console.error("errors:" + JSON.stringify(errors));
    throw errors;
  }

  return data;
}

function isPage(documentID) {
  // determine if this is a static page or an article - it will usually be an article
  var driveFile = DriveApp.getFileById(documentID)
  var fileParents = driveFile.getParents();
  var isStaticPage = false;
  while ( fileParents.hasNext() ) {
    var folder = fileParents.next();
    if (folder.getName() === "pages") {
      isStaticPage = true;
    }
  }
  return isStaticPage;
}

async function hasuraGetTranslations(articleId, localeCode) {
  var returnValue = {
    localeCode: localeCode,
    articleId: articleId,
    status: "",
    message: "",
    data: {}
  };

  var documentID = DocumentApp.getActiveDocument().getId();
  Logger.log("documentID: " + documentID);

  var isStaticPage = isPage(documentID);

  var data;
  try {
    if (isStaticPage) {
      // 
      // TODO
      //
      // data = await getPageForGoogleDoc(documentID, locale);
      // Logger.log("getPage data: " + JSON.stringify(data));
      // if (data && data.pages && data.pages[0]) {
      //   returnValue.status = "success";
      //   returnValue.message = "Retrieved page with ID: " + data.pages[0].id;
      // } else {
      //   Logger.log("getPage notFound data: " + JSON.stringify(data));
      //   returnValue.status = "notFound";
      //   returnValue.message = "Page not found";
      // }
      // returnValue.data = data;

    } else {
      data = await getTranslationDataForArticle(documentID, articleId, localeCode);
      if (data && data.article_translations && data.article_translations[0]) {
        returnValue.status = "success";
        returnValue.message = "Retrieved article translation with ID: " + data.article_translations[0].id;
      } else {
        Logger.log("failed finding a translation: " + JSON.stringify(data));
        returnValue.status = "notFound";
        returnValue.message = "Article translation not found";
      }
      returnValue.documentId = documentID;
      returnValue.data = data;
    }

  } catch (err) {
    Logger.log(JSON.stringify(err));
    returnValue.status = "error";
    returnValue.message = "An error occurred getting the article or page";
    returnValue.data = err;
  }

  return returnValue;
}
/*
. * Returns metadata about the article, including its id, whether it was published
. * headline and byline
. */
async function hasuraGetArticle() {
  var returnValue = {
    status: "",
    message: "",
    data: {}
  };

  var documentID = DocumentApp.getActiveDocument().getId();
  Logger.log("documentID: " + documentID);

  var isStaticPage = isPage(documentID);

  var data;
  try {
    if (isStaticPage) {
      data = await getPageForGoogleDoc(documentID, locale);
      Logger.log("getPage data: " + JSON.stringify(data));
      if (data && data.pages && data.pages[0]) {
        returnValue.status = "success";
        returnValue.message = "Retrieved page with ID: " + data.pages[0].id;
      } else {
        Logger.log("getPage notFound data: " + JSON.stringify(data));
        returnValue.status = "notFound";
        returnValue.message = "Page not found";
      }
      returnValue.data = data;

    } else {
      data = await getArticleForGoogleDoc(documentID);
      if (data && data.articles && data.articles[0]) {
        returnValue.status = "success";
        returnValue.message = "Retrieved article with ID: " + data.articles[0].id;
      } else {
        Logger.log("getArticle notFound data: " + JSON.stringify(data));
        returnValue.status = "notFound";
        returnValue.message = "Article not found";
      }
      returnValue.documentId = documentID;
      returnValue.data = data;
    }

  } catch (err) {
    Logger.log(JSON.stringify(err));
    returnValue.status = "error";
    returnValue.message = "An error occurred getting the article or page";
    returnValue.data = err;
  }

  return returnValue;
}

/**
. * Gets the current document's contents
. */
function getCurrentDocContents() {
  var formattedElements = formatElements();
  return formattedElements;
}

/*
.* Retrieves "elements" from the google doc - which are headings, images, paragraphs, lists
.* Preserves order, indicates that order with `index` attribute
.*/
function getElements() {
  var activeDoc = DocumentApp.getActiveDocument();
  var documentID = activeDoc.getId();
  var document = Docs.Documents.get(documentID);

  var elements = document.body.content;
  var inlineObjects = document.inlineObjects;

  var orderedElements = [];

  var listInfo = {};
  var listItems = activeDoc.getListItems();
  listItems.forEach(li => {
    var id = li.getListId();
    var glyphType = li.getGlyphType();
    listInfo[id] = glyphType;
  })

  var foundMainImage = false;

  // used to track which images have already been uploaded
  var imageList = getImageList();

  elements.forEach(element => {
    if (element.paragraph && element.paragraph.elements) {
      var eleData = {
        children: [],
        link: null,
        type: null,
        index: element.endIndex
      };

      // handle list items
      if (element.paragraph.bullet) {
        eleData.items = [];
        eleData.type = "list";
        eleData.index = element.endIndex;
        var nestingLevel = element.paragraph.bullet.nestingLevel;
        if (nestingLevel === null || typeof nestingLevel === "undefined") {
          nestingLevel = 0;
        }
        // Find existing element with the same list ID
        var listID = element.paragraph.bullet.listId;

        var findListElement = (element) => element.type === "list" && element.listId === listID
        var listElementIndex = orderedElements.findIndex(findListElement);
        // don't create a new element for an existing list
        // just append this element's text to the exist list's items
        if (listElementIndex > 0) {
          var listElement = orderedElements[listElementIndex];
          var listElementChildren = [];
          element.paragraph.elements.forEach(subElement => {
            // append list items to the main list element's children
            listElementChildren.push({
              content: cleanContent(subElement.textRun.content),
              style: cleanStyle(subElement.textRun.textStyle)
            })
          });
          listElement.items.push({
            children: listElementChildren,
            index: eleData.index,
            nestingLevel: nestingLevel
          })
          orderedElements[listElementIndex] = listElement;
        } else {
          // make a new list element
          if (listInfo[listID]) {
            eleData.listType = listInfo[listID];
          } else {
            eleData.listType = "BULLET";
          }
          eleData.type = "list";
          eleData.listId = listID;
          var listElementChildren = [];
          element.paragraph.elements.forEach(subElement => {
            // append list items to the main list element's children
            listElementChildren.push({
              content: cleanContent(subElement.textRun.content),
              style: cleanStyle(subElement.textRun.textStyle)
            })
          });
          eleData.items.push({
            nestingLevel: nestingLevel,
            children: listElementChildren,
            index: eleData.index
          })
          orderedElements.push(eleData);
        }
      }

      // filter out blank subelements
      var subElements = element.paragraph.elements.filter(subElement => subElement.textRun && subElement.textRun.content.trim().length > 0)
      // try to find an embeddable link: url on its own line matching one of a set of hosts (twitter, youtube, etc)
      if (subElements.length === 1) {
        var foundLink = subElements.find(subElement => subElement.textRun.textStyle.hasOwnProperty('link'))
        var linkUrl = null;
        var embeddableUrlRegex = /twitter\.com|youtube\.com|youtu\.be|google\.com|imgur.com|twitch\.tv|vimeo\.com|mixcloud\.com|instagram\.com|facebook\.com|dailymotion\.com/i;
        if (foundLink) {
          linkUrl = foundLink.textRun.textStyle.link.url;
        // try to find a URL by itself that google hasn't auto-linked
        } else if(embeddableUrlRegex.test(subElements[0].textRun.content.trim())) {
          linkUrl = subElements[0].textRun.content.trim();
        }
        if ( linkUrl !== null) {
          var embeddableUrl = embeddableUrlRegex.test(linkUrl);
          if (embeddableUrl) {
            eleData.type = "embed";
            eleData.link = linkUrl;
            orderedElements.push(eleData);
          }
        }
      }

      element.paragraph.elements.forEach(subElement => {
        // skip lists and embed links - we already processed these above
        if (eleData.type !== "list" && eleData.type !== "embed") {
          // found a paragraph of text
          if (subElement.textRun && subElement.textRun.content && subElement.textRun.content.trim().length > 0) {
            eleData.type = "text";

            if (element.paragraph.paragraphStyle.namedStyleType) {
              eleData.style = element.paragraph.paragraphStyle.namedStyleType;
            }
            var childElement = {
              index: subElement.endIndex,
            }
            childElement.style = cleanStyle(subElement.textRun.textStyle);

            if (subElement.textRun.textStyle && subElement.textRun.textStyle.link) {
              childElement.link = subElement.textRun.textStyle.link.url;
            }
            childElement.content = cleanContent(subElement.textRun.content);

            eleData.children.push(childElement);
          }

          // found an image
          if ( subElement.inlineObjectElement && subElement.inlineObjectElement.inlineObjectId) {
            var t10 = new Date().getTime();

            var imageID = subElement.inlineObjectElement.inlineObjectId;
            eleData.type = "image";

            // treat the first image as the main article image used in featured links
            if (!foundMainImage) {
              eleData.type = "mainImage";
              foundMainImage = true;
            }

            var fullImageData = inlineObjects[imageID];
            if (fullImageData) {

              var s3Url = imageList[imageID];
              if (s3Url === null || s3Url === undefined) {
                Logger.log(imageID + " has not been uploaded yet, uploading now...")
                s3Url = uploadImageToS3(imageID, fullImageData.inlineObjectProperties.embeddedObject.imageProperties.contentUri);
                imageList[imageID] = s3Url;
              } else {
                Logger.log(imageID + " has already been uploaded");
              }

              var childImage = {
                index: subElement.endIndex,
                height: fullImageData.inlineObjectProperties.embeddedObject.size.height.magnitude,
                width: fullImageData.inlineObjectProperties.embeddedObject.size.width.magnitude,
                imageId: subElement.inlineObjectElement.inlineObjectId,
                imageUrl: s3Url,
                imageAlt: cleanContent(fullImageData.inlineObjectProperties.embeddedObject.title)
              };
              eleData.children.push(childImage);
            }
          }
        }
      })
      // skip any blank elements, embeds and lists because they've already been handled above
      if (eleData.type !== null && eleData.type !== "list" && eleData.type !== "embed") {
        orderedElements.push(eleData);
      }
    }
  });

  Logger.log("storing image list: " + JSON.stringify(imageList))
  storeImageList(imageList);
  return orderedElements;
}


/*
.* Gets elements and formats them into JSON structure for us to work with on the front-end
.*/
function formatElements() {
  var elements = getElements();

  var formattedElements = [];
  elements.sort(function (a, b) {
    if (a.index > b.index) {
      return 1;
    } else {
      return -1;
    }
  }).forEach(element => {
    var formattedElement = {
      type: element.type,
      style: element.style,
      link: element.link,
      listType: element.listType
    };
    if (formattedElement.type === "list") {
      formattedElement.listType = element.listType;
      formattedElement.items = element.items;
    } else {
      formattedElement.children = element.children;
    }
    formattedElements.push(formattedElement);
  })
  return formattedElements;
}

//
// GraphQL functions
//

/**
 * Creates a new revision of the page
 * @param versionID
 * @param title
 * @param elements
 */
function createPageFrom(articleData) {
  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var versionID = articleData.id;
  var title = articleData.headline;
  var elements = articleData.formattedElements;
  var localeID = articleData.localeID;

  var seoData = getSEO();

  var slug = getArticleSlug();
  if (slug === null || typeof(slug) === "undefined") {
    slug = slugify(title);
    storeArticleSlug(slug);
  }

  var articleContent = JSON.stringify(elements);

  // grab current article contents
  var previousData = getPage(versionID);

  var headlineValues = i18nSetValues(title, localeID, previousData.headline.values);
  var contentValues = i18nSetValues(articleContent, localeID, previousData.content.values);
  var searchTitleValues = i18nSetValues(seoData.searchTitle, localeID, previousData.searchTitle.values);
  var searchDescriptionValues = i18nSetValues(seoData.searchDescription, localeID, previousData.searchDescription.values);
  var facebookTitleValues = i18nSetValues(seoData.facebookTitle, localeID, previousData.facebookTitle.values);
  var facebookDescriptionValues = i18nSetValues(seoData.facebookDescription, localeID, previousData.facebookDescription.values);
  var twitterTitleValues = i18nSetValues(seoData.twitterTitle, localeID, previousData.twitterTitle.values);
  var twitterDescriptionValues = i18nSetValues(seoData.twitterDescription, localeID, previousData.twitterDescription.values);

  var data = {
    slug: slug,
    headline: { values: headlineValues },
    content: { values: contentValues },
    searchTitle: { values: searchTitleValues },
    searchDescription: { values: searchDescriptionValues },
    facebookTitle: {values: facebookTitleValues},
    facebookDescription: {values: facebookDescriptionValues},
    twitterTitle: {values: twitterTitleValues},
    twitterDescription: {values: twitterDescriptionValues},
  }

  var formData = {
    query: `mutation UpdatePage($id: ID!, $data: PageInput!) {
      pages { 
        updatePage(id: $id, data: $data) {
          error {
            code
            message
          }
          data {
            id
            slug
            headline {
              values {
                value
              }
            }
            content {
              values {
                value
                locale
              }
            }
            searchTitle {
              values {
                value
                locale
              }
            }
            searchDescription {
              values {
                value
                locale
              }
            }
            facebookTitle {
              values {
                value
                locale
              }
            }
            facebookDescription {
              values {
                value
                locale
              }
            }
            twitterTitle {
              values {
                value
                locale
              }
            }
            twitterDescription {
              values {
                value
                locale
              }
            }
          }
        }
      }
    }`,
    variables: {
      id: versionID,
      data: data
    },
  };
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);
  var returnValue = {
    status: "",
    message: ""
  };
  if (responseData && responseData.data && responseData.data.pages && responseData.data.pages.updatePage && responseData.data.pages.updatePage.error === null) {
    returnValue.status = "success";
    returnValue.id = responseData.data.pages.updatePage.data.id;
    returnValue.message = "Updated page with ID " +  returnValue.id;
  } else if (responseData && responseData.data && responseData.data.pages && responseData.data.pages.updatePage && responseData.data.pages.updatePage.error !== null) {
    returnValue.status = "error";
    returnValue.message = responseData.data.pages.updatePage.error;
  } else {
    Logger.log("Unknown error: " + JSON.stringify(responseData.data));
  }

  return returnValue;
}

/**
 * Updates the article; formerly called a mutation called CreateArticleFrom, hence the strange name
 * @param versionID
 * @param title
 * @param elements
 */
function createArticleFrom(articleData) {
  var returnValue = {
    status: "success",
    message: ""
  };

  var localeID = articleData.localeID;
  if (localeID === null || localeID === undefined) {
    returnValue.status = "error";
    returnValue.message = "Missing required localeID!";
    return returnValue;
  }

  var versionID = articleData.id;
  var title = articleData.headline;
  var elements = articleData.formattedElements;

  var localeName = articleData.localeName;
  var articleAuthors = articleData.authors;
  var articleTags = articleData.tags; // only id
  var categoryID = articleData.categoryID;

  var articleContent = JSON.stringify(elements);

  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var customByline = getCustomByline();

  var seoData = getSEO();

  var categories = getCategories();
  if (categories === null || categories.length <= 0) {
    categories = listCategories();
    storeCategories(categories);
  }

  // var articleAuthors = getAuthors(); // only id

  var allAuthors = getAllAuthors(); // don't request from the DB again - too slow
  let authorSlugsValue;

  // compare all tags array to those selected for this article
  var authorIDs = [];
  var authorSlugs = [];
  allAuthors.forEach(author => {
    const result = articleAuthors.find( ({ id }) => id === author.id );
    if (result !== undefined) {
      authorIDs.push(author.id);
      authorSlugs.push(author.slug);
    }
  });

  if (authorSlugs.length > 0) {
    authorSlugsValue = authorSlugs.join(' ');
  }

  // create any new tags
  const newTags = articleTags.filter(articleTag => articleTag.newTag === true);
  if (newTags.length > 0) {
    newTags.forEach(newTag => {
      var outcome = createTag(newTag.title);
    })
  }

  var allTags = getAllTags(); // don't look up in the DB again, too slow

  var articleTags = getTags(); // refresh list of tags for this article as some may have been created just above
  // compare all tags array to those selected for this article
  var tagIDs = [];
  allTags.forEach(tag => {
    const result = articleTags.find( ({ id }) => id === tag.id );
    if (result !== undefined) {
      tagIDs.push(tag.id);
    }
  });

  // TODO: remove this, require a separate button 'publish' to actually go live with the content
  // TODO also: determine the best UX for this!
  // err on the safe side and default this flag to false
  var published = false;
  if (articleData !== undefined && articleData.published !== undefined && articleData.published !== null) {
    published = articleData.published;
  }
  storeIsPublished(published);

  var categoryName = getNameForCategoryID(categories, categoryID);
  var slug = getArticleSlug();
  if (!articleData.published) {
    slug = createArticleSlug(categoryName, title);
    storeArticleSlug(slug);
  }

  // grab current article contents
  var previousArticleData = getArticle(versionID);
  if (!previousArticleData) {
  }

  var availableLocaleNames = i18nGetLocales(localeID, previousArticleData.headline.values);

  // then merge in the new content with previous locale data
  var headlineValues = i18nSetValues(title, localeID, previousArticleData.headline.values);
  var contentValues = i18nSetValues(articleContent, localeID, previousArticleData.content.values);
  var searchTitleValues = i18nSetValues(seoData.searchTitle, localeID, previousArticleData.searchTitle.values);
  var searchDescriptionValues = i18nSetValues(seoData.searchDescription, localeID, previousArticleData.searchDescription.values);
  var facebookTitleValues = i18nSetValues(seoData.facebookTitle, localeID, previousArticleData.facebookTitle.values);
  var facebookDescriptionValues = i18nSetValues(seoData.facebookDescription, localeID, previousArticleData.facebookDescription.values);
  var twitterTitleValues = i18nSetValues(seoData.twitterTitle, localeID, previousArticleData.twitterTitle.values);
  var twitterDescriptionValues = i18nSetValues(seoData.twitterDescription, localeID, previousArticleData.twitterDescription.values);

  var updatedGoogleDocs = {};

  var previousGoogleDocs = null;
  if (articleData.googleDocs !== null) {
    previousGoogleDocs = articleData.googleDocs;
  } else if (previousArticleData.googleDocs !== null) {
    previousGoogleDocs = previousArticleData.googleDocs;
  }
  if (previousGoogleDocs && previousGoogleDocs !== null) {
    var priorGoogleDocsParsed = JSON.parse(previousGoogleDocs);
    priorGoogleDocsParsed[localeName] = articleData.documentID;
    updatedGoogleDocs = priorGoogleDocsParsed;
  } else {
    updatedGoogleDocs[localeName] = articleData.documentID;
  }

  var documentIDsForArticle = Object.values(updatedGoogleDocs);
  var documentIDsForArticleString = documentIDsForArticle.join(' ');

  var data = {
    availableLocales: availableLocaleNames,
    googleDocs: JSON.stringify(updatedGoogleDocs),
    docIDs: documentIDsForArticleString,
    // published: published,
    category: categoryID,
    customByline: customByline,
    authors: authorIDs,
    authorSlugs: authorSlugsValue,
    tags: tagIDs,
    headline: { values: headlineValues },
    headlineSearch: title,
    content: { values: contentValues },
    searchTitle: { values: searchTitleValues },
    searchDescription: { values: searchDescriptionValues },
    facebookTitle: {values: facebookTitleValues},
    facebookDescription: {values: facebookDescriptionValues},
    twitterTitle: {values: twitterTitleValues},
    twitterDescription: {values: twitterDescriptionValues},
  };

  // update the slug on unpublished articles
  if (!published) {
    data.slug = slug;
  }

  var variables = {
    revision: versionID,
    data: data
  };

  var formData = {
    query: `mutation CreateArticleFrom($revision: ID!, $data: ArticleInput!) {
      articles {
        createArticleFrom(revision: $revision, data: $data) {
          error {
            code
            data
            message
          }
          data {
            id
            headline {
              values {
                value
              }
            }
            searchTitle {
              values {
                value
              }
            }
            headlineSearch
            authors {
              id
              name
            }
            category {
              slug
            }
            tags {
              id
              title {
                values {
                  value
                }
              }
              slug
            }
          }
        }
      }
    }`,
    variables: variables
  };
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  if (responseData && responseData.data && responseData.data.articles && responseData.data.articles.updateArticle && responseData.data.articles.updateArticle.error === null) {
    returnValue.status = "success";
    returnValue.id = responseData.data.articles.updateArticle.data.id;
    returnValue.message = "Updated article with ID " +  returnValue.id;
  } else if (responseData && responseData.data && responseData.data.articles && responseData.data.articles.updateArticle && responseData.data.articles.updateArticle.error !== null) {
    returnValue.status = "error";
    returnValue.message = responseData.data.articles.updateArticle.error;
  }

  return returnValue;
}

/**
. * Posts document contents to graphql, creating a new page
. */
function createPage(articleData) {
  var title = articleData.title;
  var elements = articleData.formattedElements;
  var localeID = articleData.localeID;

  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var seoData = getSEO();

  var slug = getArticleSlug();

  var formData = {
    query:
      `mutation CreatePage($data: PageInput!) {
        pages {
            createPage(data: $data) {
                data {
                    id
                    slug
                    headline {
                      values {
                        value                    
                      }
                    }
                    content {
                      values {
                        value
                        locale
                      }
                    }
                    searchTitle {
                      values {
                        value
                        locale
                      }
                    }
                    searchDescription {
                      values {
                        value
                        locale
                      }
                    }
                    facebookTitle {
                      values {
                        value
                        locale
                      }
                    }
                    facebookDescription {
                      values {
                        value
                        locale
                      }
                    }
                    twitterTitle {
                      values {
                        value
                        locale
                      }
                    }
                    twitterDescription {
                      values {
                        value
                        locale
                      }
                    }
                }
                error  {
                  code
                  message
                  data
              }
            }
        }
    }`,
    variables: {
      data: {
        headline: {
          values: [
            {
              locale: localeID,
              value: title,
            },
          ],
        },
        slug: slug,
        content: {
          values: [
            {
              locale: localeID,
              value: JSON.stringify(elements),
            },
          ],
        },
        searchTitle: {
          values: [
            {
              locale: localeID,
              value: seoData.searchTitle,
            },
          ],
        },
        searchDescription: {
          values: [
            {
              locale: localeID,
              value: seoData.searchDescription,
            },
          ],
        },
        facebookTitle: {
          values: [
            {
              locale: localeID,
              value: seoData.facebookTitle,
            },
          ],
        },
        facebookDescription: {
          values: [
            {
              locale: localeID,
              value: seoData.facebookDescription,
            },
          ],
        },
        twitterTitle: {
          values: [
            {
              locale: localeID,
              value: seoData.twitterTitle,
            },
          ],
        },
        twitterDescription: {
          values: [
            {
              locale: localeID,
              value: seoData.twitterDescription,
            },
          ],
        },
      },
    },
  };

  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  var returnValue = {
    status: "",
    message: ""
  };
  if (responseData && responseData.data && responseData.data.pages && responseData.data.pages.createPage && responseData.data.pages.createPage.error !== null) {
    returnValue.status = "error";
    returnValue.id = null;
    returnValue.message = responseData.data.pages.createPage.error;
  } else {
    returnValue.message = "Created page with ID " +  returnValue.id;
    returnValue.status = "success";
    returnValue.id = responseData.data.pages.createPage.data.id;

  }
  return returnValue;
}

/**
. * Posts document contents to graphql, creating a new article
. */
function createArticle(articleData) {
  var title = articleData.headline;
  var elements = articleData.formattedElements;
  var localeID = articleData.localeID;
  var localeName = articleData.localeName;
  var articleAuthors = articleData.authors;
  var articleTags = articleData.tags; // only id
  var categoryID = articleData.categoryID;


  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var customByline = getCustomByline();

  var seoData = getSEO();

  var categories = getCategories();
  if (categories === null || categories.length <= 0) {
    categories = listCategories();
    storeCategories(categories);
  }

  if (localeName !== null && localeName !== undefined) {
    storeAvailableLocales(localeName);
  }

  var googleDocs = {};
  googleDocs[localeName] = articleData.documentID;

  var categoryName = getNameForCategoryID(categories, categoryID);

  var slug = getArticleSlug();
  if (slug === null || typeof(slug) === "undefined") {
    slug = createArticleSlug(categoryName, title);
    storeArticleSlug(slug);
  }

  var allAuthors = getAllAuthors(); // don't request from the DB again - too slow

  let authorSlugsValue;

  var authorIDs = [];
  var authorSlugs = [];
  allAuthors.forEach(author => {
    const result = articleAuthors.find( ({ id }) => id === author.id );
    if (result !== undefined) {
      authorIDs.push(author.id);
      authorSlugs.push(author.slug);
    }
  });

  if (authorSlugs.length > 0) {
    authorSlugsValue = authorSlugs.join(' ');
  }

  // create any new tags
  const newTags = articleTags.filter(articleTag => articleTag.newTag === true);
  if (newTags.length > 0) {
    newTags.forEach(newTag => {
      var outcome = createTag(newTag.title);
    })
  }

  var allTags = getAllTags(); // don't look up in the DB again, too slow

  var articleTags = getTags(); // refresh list of tags for this article as some may have been created just above
  // compare all tags array to those selected for this article
  var tagIDs = [];
  allTags.forEach(tag => {
    const result = articleTags.find( ({ id }) => id === tag.id );
    if (result !== undefined) {
      tagIDs.push(tag.id);
    }
  });

  var queryString = `mutation CreateArticle($data: ArticleInput!) {
      articles { 
        createArticle(data: $data) {
          error {
            message
            code
            data
          }
          data {
            id
            headline {
              values {
                value
              }
            }
            headlineSearch
            authors {
              id
              name
            }
            category {
              slug
            }
            tags {
              slug
            }
          }
        }
      }
    }`;
  var gqlVariables = {
      data: {
        availableLocales: localeName,
        headline: {
          values: [
            {
              locale: localeID,
              value: title,
            },
          ],
        },
        headlineSearch: title,
        slug: slug,
        category: categoryID,
        content: {
          values: [
            {
              locale: localeID,
              value: JSON.stringify(elements),
            },
          ],
        },
        customByline: customByline,
    		tags: tagIDs,
    		authors: authorIDs,
        authorSlugs: authorSlugsValue,
        searchTitle: {
          values: [
            {
              locale: localeID,
              value: seoData.searchTitle,
            },
          ],
        },
        searchDescription: {
          values: [
            {
              locale: localeID,
              value: seoData.searchDescription,
            },
          ],
        },
        facebookTitle: {
          values: [
            {
              locale: localeID,
              value: seoData.facebookTitle,
            },
          ],
        },
        facebookDescription: {
          values: [
            {
              locale: localeID,
              value: seoData.facebookDescription,
            },
          ],
        },
        twitterTitle: {
          values: [
            {
              locale: localeID,
              value: seoData.twitterTitle,
            },
          ],
        },
        twitterDescription: {
          values: [
            {
              locale: localeID,
              value: seoData.twitterDescription,
            },
          ],
        },
        // published: articleData.published,
        googleDocs: JSON.stringify(googleDocs)
      }
  };
  var formData = {
    query: queryString,
    variables: gqlVariables
  };

  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );

  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  var returnValue = {
    status: "",
    message: ""
  };
  if (responseData && responseData.data && responseData.data.articles && responseData.data.articles.createArticle && responseData.data.articles.createArticle.error !== null) {
    returnValue.status = "error";
    returnValue.id = null;
    returnValue.message = responseData.data.articles.createArticle.error;
  } else {
    returnValue.message = "Created article with ID " +  returnValue.id;
    returnValue.status = "success";
    returnValue.id = responseData.data.articles.createArticle.data.id;

  }
  return returnValue;
}

/* This function clears out the google doc properties (articleID, anything stored) without expecting
 * access to a webiny API
 * it's useful if we have to relaunch the API and reconfigure the add-on in the event of an API failure
 */
function clearCache() {
  storeIsPublished(false);
  deleteArticleSlug();
  deleteArticleID();
  deletePublishingInfo();
  deleteSEO();
  deleteTags();
  deleteCategories();

  var result = deleteAllValues();

  return "Cleared cache";
}

function publishPage() {
  var versionID = getArticleID();

  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var formData = {
    query: `mutation UpdatePage($id: ID!, $data: PageInput!) {
      pages { 
        updatePage(id: $id, data: $data) {
          data {
            id
            firstPublishedOn
            lastPublishedOn
            published
          }
        }
      }
    }`,
    variables: {
      id: versionID,
      data: {
        published: true,
      },
    },
  };
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  if (responseData && responseData.data && responseData.data.pages && responseData.data.pages.updatePage && responseData.data.pages.updatePage.data) {
    return "Published page at revision " + versionID;
  } else {
    return responseData.data.pages.updatePage.error;
  }
}


/**
 * Publishes the article
 */
function publishArticle() {
  var versionID = getArticleID();

  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var formData = {
    query: `mutation PublishArticle($revision: ID!) {
      articles { 
        publishArticle(revision: $revision) {
          error {
            code
            message
          }
          data {
            id
            firstPublishedOn
            lastPublishedOn
            published
            latestVersion
            version
            slug
            category {
              slug
            }
          }
        }
      }
    }`,
    variables: {
      revision: versionID
    },
  };

  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  // TODO update latestVersionPublished flag

  var returnValue = {
    status: "success",
    message: ""
  }
  if (responseData && responseData.data && responseData.data.articles && responseData.data.articles.publishArticle && responseData.data.articles.publishArticle.data) {
    storeIsPublished(true);
    returnValue.status = "success";

    let slug = responseData.data.articles.publishArticle.data.slug;
    let categorySlug = responseData.data.articles.publishArticle.data.category.slug;

    var publishUrl = scriptConfig['PUBLISH_URL'];
    var fullPublishUrl = publishUrl + "/articles/" + categorySlug + "/" + slug;
    // open preview url in new window
    returnValue.message += "<br>Published the article. <a href='" + fullPublishUrl + "' target='_blank'>Click to view</a>."
  } else {
    storeIsPublished(false);
    returnValue.status = "error";
    returnValue.message = "Failed to publish article because: " + JSON.stringify(responseData.data.articles.publishArticle.error);
  }
  return returnValue;
}

/**
 * Unpublishes the article
 */
function unpublishArticle() {
  var versionID = getArticleID();

  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var formData = {
    query: `mutation UnpublishArticle($revision: ID!) {
      articles { 
        unpublishArticle(revision: $revision) {
          error {
            code
            message
          }
          data {
            id
            firstPublishedOn
            lastPublishedOn
            published
            latestVersion
            version
          }
        }
      }
    }`,
    variables: {
      revision: versionID
    },
  };

  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  var returnValue = {
    status: "success",
    message: ""
  }
  if (responseData && responseData.data && responseData.data.articles && responseData.data.articles.unpublishArticle && responseData.data.articles.unpublishArticle.data) {
    storeIsPublished(false);
    returnValue.status = "success";
    returnValue.message = "Unpublished article at revision " + versionID;
  } else {
    storeIsPublished(true);
    returnValue.status = "error";
    returnValue.message = "Failed to unpublish article because: " + JSON.stringify(responseData.data.articles.unpublishArticle.error);
  }
  return returnValue;
}

/**
 * Rebuilds the site by POSTing to deploy hook
 */
function rebuildSite() {
  var scriptConfig = getScriptConfig();
  var DEPLOY_HOOK = scriptConfig['VERCEL_DEPLOY_HOOK_URL'];

  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json'
  };

  var response = UrlFetchApp.fetch(
    DEPLOY_HOOK,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);
  return responseData;
}

function listCategories() {
  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];
  var formData = {
    query: `{
      categories	{
        listCategories {
          error {
            code
            message
          }
          data {
            id
            title {
              values {
                value
              }
            }
            slug
          }
        }
      }
    }`
  };
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  if (responseData && responseData.data && responseData.data.categories && responseData.data.categories.listCategories && responseData.data.categories.listCategories.data !== null) {
    return responseData.data.categories.listCategories.data;
  } else {
    return responseData.data.categories.listCategories.error;
  }
}

function loadAuthorsFromDB() {
  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];
  var formData = {
    query: `
    {
      authors {
        listAuthors {
          error {
            code
            message
          }
          data {
            id
            name
            bio {
              values {
                value
              }
            }
            twitter
            title {
              values {
                value
              }
            }
            slug
            photoUrl
          }
    
        }
      }
    }`
  };
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  if (responseData && responseData.data && responseData.data.authors && responseData.data.authors.listAuthors && responseData.data.authors.listAuthors.data !== null) {
    return responseData.data.authors.listAuthors.data;
  } else if (responseData && responseData.data && responseData.data.authors && responseData.data.authors.listAuthors && responseData.data.authors.listAuthors.error) {
    return responseData.data.authors.listAuthors.error;
  }
}

function loadTagsFromDB() {
  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];
  var formData = {
    query: `{
      tags	{
        listTags {
          error {
            code
            data
            message
          }
          data {
            id
            title {
              values {
                value
              }
            }
            slug
          }
        }
      }
    }`
  };
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  if (responseData && responseData.data && responseData.data.tags && responseData.data.tags.listTags && responseData.data.tags.listTags.data !== null) {
    return responseData.data.tags.listTags.data;
  } else if (responseData && responseData.data && responseData.data.tags && responseData.data.tags.listTags && responseData.data.tags.listTags.error) {
    return responseData.data.tags.listTags.error;
  }
}

// todo move to utility
function tagExists(tagData) {
  return tagData.title === 'cherries';
}

function addTagToLocalStore(formObject) {
  var tagTitle = formObject['new-article-tag'];
  var articleTags = getTags();
  const result = articleTags.find( ({ title }) => title === tagTitle );
  if (result !== undefined) {
    return "Tag already exists: ", tagTitle;
  } else {
    articleTags.push({
      id: null,
      title: tagTitle
    });
    storeTags(articleTags);
    return "Stored new tag: ", tagTitle
  }
}

function createTag(tagTitle) {
  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var articleTags = getTags();
  const result = articleTags.find( ({ title }) => title === tagTitle );
  if (result !== undefined && !result.newTag && result.id !== null) {
    return;
  }

  var localeID = getLocaleID();
  if (localeID === null) {
    var locales = getLocales();
    setDefaultLocale(locales);
    localeID = getLocaleID();
    if (localeID === null) {
      return 'Failed updating article: unable to find a default locale';
    }
  }

  var formData = {
    query: ` mutation CreateTag($data: TagInput!) {
      tags {
          createTag(data: $data) {
            data {
              id
              title {
                values {
                  value                
                }
              }
              slug
              published
            }
            error  {
              code
              message
              data
            }
          }
      }
    }`,
    variables: {
        data: {
          title: {
            values: [
              {
                value: tagTitle,
                locale: localeID
              }
            ]
          },
          slug: slugify(tagTitle),
          published: true
        }
      }
  };
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );

  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  var newTagData = responseData.data.tags.createTag.data;
  var returnValue = {
    status: "success",
    data: newTagData
  }
  if (newTagData === null || newTagData === undefined) {
    returnValue.status = "error";
    returnValue.data = responseData;
    returnValue.message = "An error occurred trying to create tag " + tagTitle;
    return returnValue;
  }

  var allTags = getAllTags();

  // if we found this tag already in the articleTags, update it with the ID and mark it as no longer new
  const tagIndex = articleTags.findIndex( ({title}) => title === tagTitle);
  if (tagIndex >= 0) {
    articleTags[tagIndex].newTag = false;
    articleTags[tagIndex].id = newTagData.id;
    var allTagsData = {
      title: {
        value: articleTags[tagIndex].title
      },
      newTag: false,
      id: articleTags[tagIndex].id
    }
    allTags.push(allTagsData);

  // otherwise just append the new tag data
  } else {
    let tagData ={
      id: newTagData.id,
      newTag: false,
      title: newTagData.title
    }
    articleTags.push(tagData);
    // append to ALL_TAGS
    var allTagsData = {
      title: {
        value: tagData.title
      },
      newTag: false,
      id: tagData.id
    }
    allTags.push(tagData);
  }

  storeAllTags(allTags);
  storeTags(articleTags);

  return responseData;
}

function getLocales() {
  var returnValue = {
    status: "",
    message: ""
  };

  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  if (ACCESS_TOKEN === null || CONTENT_API === null || ACCESS_TOKEN === undefined || CONTENT_API === undefined) {
    returnValue.status = "error";
    returnValue.message = "API not configured! Please ensure document is in the right folder structure and API is configured."
    return returnValue;
  }

  query = `{
    i18n {
      listI18NLocales {
        data {
          id
          code
          default
        }
      }
    }
  }`;

  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization:
        ACCESS_TOKEN,
    },
    payload: JSON.stringify({ query: query }),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);

  var localeData = responseData.data.i18n.listI18NLocales.data;
  return localeData;
}

function setDefaultLocale(locales) {
  var localeID = null;
  for (var i = 0; i < locales.length; i++) {
    if (locales[i].default) {
      localeID = locales[i].id;
    }
  }
  if (localeID !== null) {
    storeLocaleID(localeID);
  }
  return 'Stored localeID as ' + localeID;
}

function getPage(id) {
  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var formData = {
    query: `query GetPage($id: ID!) {
      pages {
        getPage(id: $id) {
          data {
            id
            headline {
              values {
                value
                locale
              }
            }
            content {
              values {
                value
                locale
              }
            }
            searchTitle {
              values {
                value
                locale
              }
            }
            searchDescription {
              values {
                value
                locale
              }
            }
            facebookTitle {
              values {
                value
                locale
              }
            }
            facebookDescription {
              values {
                value
                locale
              }
            }
            twitterTitle {
              values {
                value
                locale
              }
            }
            twitterDescription {
              values {
                value
                locale
              }
            }
            slug
    
          }
        }
      }
    }`,
    variables: {
      id: id,
    }
  };
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);
  return responseData.data.pages.getPage.data;
}

function getArticle(id) {
  var scriptConfig = getScriptConfig();
  var ACCESS_TOKEN = scriptConfig['ACCESS_TOKEN'];
  var CONTENT_API = scriptConfig['CONTENT_API'];

  var formData = {
    query: `query GetArticle($id: ID!) {
      articles {
        getArticle(id: $id) {
          error {
            message
            code
            data
          }
          data {
            id
            googleDocs
            availableLocales
            firstPublishedOn
            lastPublishedOn
            headline {
              values {
                value
                locale
              }
            }
            content {
              values {
                value
                locale
              }
            }
            searchTitle {
              values {
                value
                locale
              }
            }
            searchDescription {
              values {
                value
                locale
              }
            }
            facebookTitle {
              values {
                value
                locale
              }
            }
            facebookDescription {
              values {
                value
                locale
              }
            }
            twitterTitle {
              values {
                value
                locale
              }
            }
            twitterDescription {
              values {
                value
                locale
              }
            }
            authorSlugs
            customByline
            slug
            authors {
              id
              name
              slug
            }
            category {
              id
              title {
                values {
                  value
                  locale
                }
              }
              slug
            }
            tags {
              id
              title {
                values {
                  value
                  locale
                }
              }
              slug
            }
          }
        }
      }
    }`,
    variables: {
      id: id,
    }
  };
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      authorization: ACCESS_TOKEN,
    },
    payload: JSON.stringify(formData),
  };

  var response = UrlFetchApp.fetch(
    CONTENT_API,
    options
  );
  var responseText = response.getContentText();
  var responseData = JSON.parse(responseText);
  return responseData.data.articles.getArticle.data;
}

function setArticleMeta() {
  var articleID = getArticleID();

  var documentType = getDocumentType();

  // prefer custom headline (set in sidebar form) but fallback to document name
  var headline = getHeadline();
  if (typeof(headline) === "undefined" || headline === null || headline.trim() === "") {
    headline = getDocumentName();
    storeHeadline(headline);
  }

  var slug = getArticleSlug();
  if (slug === null || typeof(slug) === "undefined") {
    if (documentType === "article") {
      slug = createArticleSlug(categoryName, headline);
    } else {
      slug = slugify(headline);
    }
    storeArticleSlug(slug);
  }

  if (documentType !== "article") {
    return null;
  }

  var categories = getCategories();
  if (categories === null || categories.length <= 0) {
    categories = listCategories();
    storeCategories(categories);
  }

  var categoryID = getCategoryID();
  var categoryName = getNameForCategoryID(categories, categoryID);

  if (typeof(articleID) === "undefined" || articleID === null) {
    return null;
  }

  var articleData = getArticle(articleID);
  var articleID = articleData.id;

  var tagsData = articleData.tags;
  var tagIDs = [];
  tagsData.forEach(tagData => {
    tagIDs.push(tagData.id)
  });
  var uniqueTags = tagIDs.filter(onlyUnique);
  storeTags(uniqueTags);

  return articleData;
}

/*
.* called from Page.html, this function handles incoming form data from the sidebar,
.* setting the headline and byline (for now)
.*/
function processForm(formObject) {
  if (formObject === null || typeof(formObject) === "undefined") {
    return;
  }
  var headline = formObject["article-headline"];
  storeHeadline(headline);

  var formSelectedLocale  = formObject["article-locale"];
  if (formSelectedLocale !== null && formSelectedLocale !== undefined) {
    storeLocaleID(formSelectedLocale);
  }

  // get the current locale code; if it's not stored already, store it
  var selectedLocaleName = getSelectedLocaleName();
  if (selectedLocaleName === null || selectedLocaleName === undefined || selectedLocaleName === "") {
    var locales = getLocales();
    var selectedLocaleID = getLocaleID();
    if (formSelectedLocale) {
      var selectedLocale = locales.find((locale) => locale.id === formSelectedLocale);
      if (selectedLocale && selectedLocale !== null && selectedLocale !== undefined) {
        selectedLocaleName = selectedLocale.code;
        storeSelectedLocaleName(selectedLocaleName);
      }

    } else if (selectedLocaleID) {
      var selectedLocale = locales.find((locale) => locale.id === selectedLocaleID);
      if (selectedLocale) {
        selectedLocaleName = selectedLocale.code;
        storeSelectedLocaleName(selectedLocaleName);
      }
    }
  }

  var documentType = getDocumentType();

  if (documentType && documentType === "article") {
    var customByline = formObject["article-custom-byline"];
    storeCustomByline(customByline);

    var authors = formObject["article-authors"];
    if (authors !== undefined) {
      storeAuthors(authors);
    }

    var tags = formObject["article-tags"];
    if (tags !== undefined) {
      storeTags(tags);
    }

    var categoryID = formObject["article-category"]
    if (categoryID !== undefined) {
      storeCategoryID(categoryID);
    }
  }

  var seoData = {
    searchTitle: formObject["article-search-title"],
    searchDescription: formObject["article-search-description"],
    facebookTitle: formObject["article-facebook-title"],
    facebookDescription: formObject["article-facebook-description"],
    twitterTitle: formObject["article-twitter-title"],
    twitterDescription: formObject["article-twitter-description"],
  }

  storeSEO(seoData);

  return "Updated document metadata. You still need to publish for these changes to go live!"
}

/*
.* called from ManualPage.html, this function associates the google doc with the selected article
.*/
function associateArticle(formObject) {

  var articleData = {};

  var articleID  = formObject["article-id"];
  articleData.id = articleID;

  var documentID = DocumentApp.getActiveDocument().getId();
  articleData.documentID = documentID;

  var localeID  = formObject["article-locale"];
  articleData.localeID = localeID;

  var locales = getLocales();
  var selectedLocale = locales.find((locale) => locale.id === localeID);
  if (selectedLocale) {
    storeSelectedLocaleName(selectedLocale.code);
    articleData.localeName = selectedLocale.code;
  }

  var headline = getHeadline();
  if (typeof(headline) === "undefined" || headline === null || headline.trim() === "") {
    headline = getDocumentName();
    storeHeadline(headline);
  }
  articleData.headline = headline;

  var formattedElements = formatElements();
  articleData.formattedElements = formattedElements;

  articleData.published = false;
  articleData.authors = getAuthors();
  articleData.tags = getTags();

  var responseData = createArticleFrom(articleData);

  if (responseData && responseData.status !== "error") {
    // finally store the articleID so we know whether to freshly associate the doc going forward.
    var articleID = responseData.id;
    storeArticleID(articleID);
  }

  return responseData;
}

function i18nGetLocales(currentLocaleID, exampleLocalisedValues) {

  var availableLocales = null;

  var localesAvailable = exampleLocalisedValues.map(value=>value.locale)

  if (!localesAvailable.includes(currentLocaleID)) {
    localesAvailable.push(currentLocaleID);
  }

  var allLocales = getLocales();
  var localeNames = [];

  localesAvailable.forEach( (item, index) => {
    var selectedLocale = allLocales.find((locale) => locale.id === item);
    if (selectedLocale) {
      localeNames.push(selectedLocale.code);
    }
  });

  availableLocales = localeNames.join(" ");
  storeAvailableLocales(availableLocales);

  return availableLocales;
}

function i18nSetValues(text, localeID, previousValues) {
  // don't bother appending blank values for this locale
  if (text === null || text === undefined || text === "") {
    return previousValues;
  }
  var newValues;
  if (previousValues && previousValues.length > 0) {
    var foundIt = false;
    newValues = previousValues.map( (obj) => {
      if (obj.locale === localeID) {
        foundIt = true;
        obj.value = text;
      }
      return obj;
    });
    // case handling when there was no search title set in this locale
    if (!foundIt) {
      newValues = previousValues;
      newValues.push({
        value: text,
        locale: localeID
      });
    }
  // case handling when there was NO previous value set in any language
  } else {
    newValues = [{
      value: text,
      locale: localeID
    }]
  }
  return newValues;
}

function createNewDoc(newLocale) {
  if (newLocale === null || typeof(newLocale) === "undefined") {
    return;
  }
  var localeName = cleanContent(newLocale);

  var currentHeadline = getHeadline();
  var newHeadline = currentHeadline + " (" + localeName + ")";

  var parentDocID = DocumentApp.getActiveDocument().getId();
  var parentArticleID = getArticleID();

  var docID;
  var driveFile = DriveApp.getFileById(parentDocID);
  var newFile = driveFile.makeCopy(newHeadline);
  if (newFile) {
    docID = newFile.getId();
  } else {
    Logger.log("failed creating new file via DriveApp")
    return null;
  }

  // setup the articleData
  var articleData = {};

  articleData.documentID = docID;
  articleData.id = parentArticleID;
  articleData.headline = newHeadline;
  articleData.formattedElements = formatElements();
  articleData.categoryID = getCategoryID();
  articleData.authors = getAuthors();
  articleData.tags = getTags();

  var locales = getLocales();
  var selectedLocale = locales.find((locale) => locale.code === localeName);
  if (selectedLocale) {
    articleData.localeID = selectedLocale.id;
    articleData.localeName = selectedLocale.code;
  } else {
    articleData.localeName = localeName;
  }

  // articleData.published
  articleData.published = false;

  var googleDocsInfo = {};
  if (parentArticleID !== null && parentArticleID !== undefined) {
    var latestArticle = getArticleDataByID(parentArticleID);

    if (latestArticle && latestArticle.status === "success") {
      var latestArticleData = latestArticle.data;
      if (latestArticleData.googleDocs) {
        try {
          googleDocsInfo = JSON.parse(latestArticleData.googleDocs);
        } catch(e) {
          Logger.log("error parsing googleDocs json: " + e);
        }
      }
    }
  }
  // store the new document ID for this locale
  googleDocsInfo[localeName] = docID;

  articleData.googleDocs = JSON.stringify(googleDocsInfo);

  // update the article for this document
  responseData = createArticleFrom(articleData);

  if (responseData && responseData.status !== "success") {
    Logger.log("createNewDoc update FAIL:" + JSON.stringify(responseData));
  }

  return {
    docID: docID,
    parentID: parentDocID,
    responseData: responseData
  };
}
