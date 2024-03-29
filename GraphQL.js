/* Mutations */

const insertArticleSlugVersion = `mutation AddonInsertArticleSlugVersion($article_id: Int!, $slug: String!, $category_slug: String!) {
  insert_article_slug_versions(on_conflict: {constraint: slug_versions_pkey, update_columns: article_id}, objects: {article_id: $article_id, slug: $slug, category_slug: $category_slug}) {
    affected_rows
  }
}`;

const insertPageSlugVersion = `mutation AddonInsertPageSlugVersion($slug: String!, $page_id: Int!) {
  insert_page_slug_versions(objects: {page_id: $page_id, slug: $slug}, on_conflict: {constraint: page_slug_versions_pkey, update_columns: page_id}) {
    affected_rows
  }
}`;

const deleteAuthorArticlesMutation = `mutation AddonDeleteAuthorArticles($article_id: Int) {
  delete_author_articles(where: {article_id: {_eq: $article_id}}) {
    affected_rows
  }
}`;

const insertAuthorArticleMutation = `mutation AddonInsertAuthorArticle($article_id: Int!, $author_id: Int!) {
  insert_author_articles(objects: {article_id: $article_id, author_id: $author_id}, on_conflict: {constraint: author_articles_article_id_author_id_key, update_columns: article_id}) {
    affected_rows
  }
}`;

const insertAuthorPageMutation = `mutation AddonInsertAuthorPage($page_id: Int!, $author_id: Int!) {
  insert_author_pages(objects: {page_id: $page_id, author_id: $author_id}, on_conflict: {constraint: author_pages_page_id_author_id_key, update_columns: page_id}) {
    affected_rows
  }
}`;

const insertArticleGoogleDocMutationWithoutId = `mutation AddonInsertArticleGoogleDocNoID($locale_code: String!, $created_by_email: String, $headline: String!, $published: Boolean, $category_id: Int!, $slug: String!, $document_id: String, $url: String, $custom_byline: String, $content: jsonb, $facebook_description: String, $facebook_title: String, $search_description: String, $search_title: String, $twitter_description: String, $twitter_title: String, $canonical_url: String, $main_image: jsonb,  $first_published_at: timestamptz, $article_sources: [article_source_insert_input!]!) {
  insert_articles(
    objects: {
      article_translations: {
        data: {
          created_by_email: $created_by_email, 
          headline: $headline, 
          locale_code: $locale_code, 
          published: $published, 
          content: $content, 
          custom_byline: $custom_byline, 
          facebook_description: $facebook_description, 
          facebook_title: $facebook_title, 
          search_description: $search_description, 
          search_title: $search_title, 
          twitter_description: $twitter_description, 
          twitter_title: $twitter_title,
          main_image: $main_image,
          first_published_at: $first_published_at
        }
      }, 
      category_id: $category_id, 
      slug: $slug, 
      canonical_url: $canonical_url,
      article_sources: {
        data: $article_sources,
        on_conflict: {constraint: article_source_article_id_source_id_key, update_columns: article_id}
      },
      article_google_documents: {
        data: {
          google_document: {
            data: {
              document_id: $document_id, 
              locale_code: $locale_code, 
              url: $url
            }, 
            on_conflict: {
              constraint: google_documents_organization_id_document_id_key, update_columns: locale_code
            }
          }
        }, 
        on_conflict: {
          constraint: article_google_documents_article_id_google_document_id_key, update_columns: google_document_id
        }
      }
    }, 
    on_conflict: {
      constraint: articles_slug_category_id_organization_id_key, update_columns: [canonical_url, slug, updated_at]
    }
  ) {
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
          locale {
            code
            name
          }
          url
          id
        }
      }
      article_sources {
        source {
          affiliation
          age
          email
          ethnicity
          gender
          id
          name
          phone
          race
          role
          sexual_orientation
          zip
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
        headline
        first_published_at
        last_published_at
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

const insertArticleGoogleDocMutation = `mutation AddonInsertArticleGoogleDocWithID($id: Int!, $locale_code: String!, $headline: String!, $created_by_email: String, $published: Boolean, $category_id: Int!, $slug: String!, $document_id: String, $url: String, $custom_byline: String, $content: jsonb, $facebook_description: String, $facebook_title: String, $search_description: String, $search_title: String, $twitter_description: String, $twitter_title: String, $canonical_url: String, $main_image: jsonb, $first_published_at: timestamptz,
  $article_sources: [article_source_insert_input!]!) {
  insert_articles(
    objects: {
      article_translations: {
        data: {
          first_published_at: $first_published_at, created_by_email: $created_by_email, headline: $headline, locale_code: $locale_code, published: $published, content: $content, custom_byline: $custom_byline, facebook_description: $facebook_description, facebook_title: $facebook_title, search_description: $search_description, search_title: $search_title, twitter_description: $twitter_description, twitter_title: $twitter_title, main_image: $main_image
        }
      }, 
      article_sources: {
        data: $article_sources,
        on_conflict: {constraint: article_source_article_id_source_id_key, update_columns: article_id}
      },
      category_id: $category_id, 
      id: $id, 
      slug: $slug, 
      canonical_url: $canonical_url,
      article_google_documents: {
        data: {
          google_document: {
            data: {
              document_id: $document_id, locale_code: $locale_code, url: $url
            }, 
            on_conflict: {
              constraint: google_documents_organization_id_document_id_key, update_columns: locale_code
            }
          }
        }, 
        on_conflict: {
          constraint: article_google_documents_article_id_google_document_id_key, update_columns: google_document_id
        }
      }
    }, 
    on_conflict: {
      constraint: articles_pkey, update_columns: [category_id, canonical_url, slug, updated_at]
    }
  ) {
    returning {
      id
      canonical_url
      slug
      updated_at
      created_at
      article_google_documents {
        id
        google_document {
          document_id
          locale_code
          locale {
            code
            name
          }
          url
          id
        }
      }
      article_sources {
        source {
          affiliation
          age
          email
          ethnicity
          gender
          id
          name
          phone
          race
          role
          sexual_orientation
          zip
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
        headline
        first_published_at
        last_published_at
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

const insertArticleGoogleDocMutationWithoutSources = `mutation AddonInsertArticleGoogleDocWithoutSources($id: Int!, $locale_code: String!, $headline: String!, $created_by_email: String, $published: Boolean, $category_id: Int!, $slug: String!, $document_id: String, $url: String, $custom_byline: String, $content: jsonb, $facebook_description: String, $facebook_title: String, $search_description: String, $search_title: String, $twitter_description: String, $twitter_title: String, $main_image: jsonb, $first_published_at: timestamptz) {
  insert_articles(
    objects: {
      article_translations: {
        data: {
          created_by_email: $created_by_email, headline: $headline, locale_code: $locale_code, published: $published, content: $content, custom_byline: $custom_byline, facebook_description: $facebook_description, facebook_title: $facebook_title, search_description: $search_description, search_title: $search_title, twitter_description: $twitter_description, twitter_title: $twitter_title, main_image: $main_image, first_published_at: $first_published_at
        }
      }, 
      category_id: $category_id, 
      id: $id, 
      slug: $slug, 
      article_google_documents: {
        data: {
          google_document: {
            data: {
              document_id: $document_id, locale_code: $locale_code, url: $url
            }, 
            on_conflict: {
              constraint: google_documents_organization_id_document_id_key, update_columns: locale_code
            }
          }
        }, 
        on_conflict: {
          constraint: article_google_documents_article_id_google_document_id_key, update_columns: google_document_id
        }
      }
    }, 
    on_conflict: {
      constraint: articles_pkey, update_columns: [category_id, slug, updated_at]
    }
  ) {
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
          locale {
            code
            name
          }
          url
          id
        }
      }
      article_sources {
        source {
          affiliation
          age
          email
          ethnicity
          gender
          id
          name
          phone
          race
          role
          sexual_orientation
          zip
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
        headline
        first_published_at
        last_published_at
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

const insertGoogleDocMutation = `mutation AddonInsertGoogleDoc($article_id: Int!, $document_id: String!, $locale_code: String!, $url: String) {
  insert_article_google_documents(objects: {article_id: $article_id, google_document: {data: {document_id: $document_id, locale_code: $locale_code, url: $url}, on_conflict: {constraint: google_documents_organization_id_document_id_key, update_columns: url}}}, on_conflict: {constraint: article_google_documents_article_id_google_document_id_key, update_columns: google_document_id}) {
    affected_rows
  }
}`;

const insertPageGoogleDocMutation = `mutation AddonInsertPageGoogleDoc($page_id: Int!, $document_id: String!, $locale_code: String!, $url: String) {
  insert_page_google_documents(objects: {page_id: $page_id, google_document: {data: {document_id: $document_id, locale_code: $locale_code, url: $url}, on_conflict: {constraint: google_documents_organization_id_document_id_key, update_columns: url}}}, on_conflict: {constraint: page_google_documents_page_id_google_document_id_key, update_columns: google_document_id}) {
    affected_rows
  }
}`;

const insertPageGoogleDocsMutationWithoutId = `mutation AddonInsertPageGoogleDocNoID($slug: String!, $locale_code: String!, $created_by_email: String, $document_id: String, $url: String, $facebook_title: String, $facebook_description: String, $search_title: String, $search_description: String, $headline: String, $twitter_title: String, $twitter_description: String, $content: jsonb, $published: Boolean) {
  insert_pages(objects: {page_google_documents: {data: {google_document: {data: {document_id: $document_id, locale_code: $locale_code, url: $url}, on_conflict: {constraint: google_documents_organization_id_document_id_key, update_columns: [document_id]}}}, on_conflict: {constraint: page_google_documents_page_id_google_document_id_key, update_columns: [google_document_id]}}, slug: $slug, page_translations: {data: {created_by_email: $created_by_email, published: $published, search_description: $search_description, search_title: $search_title, twitter_description: $twitter_description, twitter_title: $twitter_title, locale_code: $locale_code, headline: $headline, facebook_title: $facebook_title, facebook_description: $facebook_description, content: $content}}}, on_conflict: {constraint: pages_slug_organization_id_key, update_columns: [slug, updated_at]}) {
    returning {
      id
      slug
      page_google_documents {
        id
        google_document {
          document_id
          locale_code
          locale {
            code
            name
          }
          url
        }
      }
      page_translations(where: {locale_code: {_eq: $locale_code}}, order_by: {id: desc}, limit: 1) {
        id
        page_id
        headline
        first_published_at
        last_published_at
        locale_code
        published
      }
    }
  }
}`;
const insertPageGoogleDocsMutation = `mutation AddonInsertPageGoogleDocWithID($id: Int!, $slug: String!, $locale_code: String!, $created_by_email: String, $document_id: String, $url: String, $facebook_title: String, $facebook_description: String, $search_title: String, $search_description: String, $headline: String, $twitter_title: String, $twitter_description: String, $content: jsonb, $published: Boolean) {
  insert_pages(objects: {page_google_documents: {data: {google_document: {data: {document_id: $document_id, locale_code: $locale_code, url: $url}, on_conflict: {constraint: google_documents_organization_id_document_id_key, update_columns: [document_id]}}}, on_conflict: {constraint: page_google_documents_page_id_google_document_id_key, update_columns: [google_document_id]}}, id: $id, slug: $slug, page_translations: {data: {created_by_email: $created_by_email, published: $published, search_description: $search_description, search_title: $search_title, twitter_description: $twitter_description, twitter_title: $twitter_title, locale_code: $locale_code, headline: $headline, facebook_title: $facebook_title, facebook_description: $facebook_description, content: $content}}}, on_conflict: {constraint: pages_pkey, update_columns: [slug, updated_at]}) {
    returning {
      id
      slug
      page_google_documents {
        id
        google_document {
          document_id
          locale_code
          locale {
            code
            name
          }
          url
        }
      }
      page_translations(where: {locale_code: {_eq: $locale_code}}, order_by: {id: desc}, limit: 1) {
        id
        page_id
        headline
        first_published_at
        last_published_at
        locale_code
        published
      }
    }
  }
}`;

const deleteTagArticlesMutation = `mutation AddonDeleteTagArticles($article_id: Int) {
  delete_tag_articles(where: {article_id: {_eq: $article_id}}) {
    affected_rows
  }
}`;

const insertTagMutation = `mutation AddonInsertTag($slug: String, $locale_code: String, $title: String, $article_id: Int!) {
  insert_tag_articles(objects: {article_id: $article_id, tag: {data: {slug: $slug, tag_translations: {data: {locale_code: $locale_code, title: $title}, on_conflict: {constraint: tag_translations_tag_id_locale_code_key, update_columns: locale_code}}, published: true}, on_conflict: {constraint: tags_organization_id_slug_key, update_columns: organization_id}}}, on_conflict: {constraint: tag_articles_article_id_tag_id_key, update_columns: article_id}) {
    returning {
      id
      article_id
      tag_id
    }
  }
}`;

const linkDocToArticleMutation = `mutation AddonLinkGoogleDocToArticle($article_id: Int!, $document_id: String!, $locale_code: String!, $url: String) {
  delete_article_google_documents(where: {article_id: {_eq: $article_id}, google_document: {locale_code: {_eq: $locale_code}}}) {
    affected_rows
  }
  insert_article_google_documents(objects: {article_id: $article_id, google_document: {data: {document_id: $document_id, locale_code: $locale_code, url: $url}, on_conflict: {constraint: google_documents_organization_id_document_id_key, update_columns: url}}}, on_conflict: {constraint: article_google_documents_article_id_google_document_id_key, update_columns: google_document_id}) {
    returning {
      article_id
      article {
        slug
      }
    }
  }
}`;

const upsertPublishedArticleTranslationMutation = `mutation AddonUpsertPublishedArticleTranslation($article_id: Int, $article_translation_id: Int, $locale_code: String) {
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

const unpublishArticleMutation = `mutation AddonUnpublishArticle($article_id: Int!, $locale_code: String!) {
  update_article_translations(where: {article_id: {_eq: $article_id}, locale_code: {_eq: $locale_code}}, _set: {published: false}) {
    affected_rows
  }
}`;

const unpublishPageMutation = `mutation AddonUnpublishPage($page_id: Int!, $locale_code: String!) {
  update_page_translations(where: {page_id: {_eq: $page_id}, locale_code: {_eq: $locale_code}}, _set: {published: false}) {
    affected_rows
  }
}`;

/* Queries */

const findPageBySlugQuery = `query AddonFindPageBySlug($slug: String!, $document_id: String!, $locale_code: String) {
  pages(where: {slug: {_eq: $slug}, page_google_documents: {google_document: {document_id: {_neq: $document_id}, locale_code: {_eq: $locale_code}}}}) {
    id
    created_at
    slug
    page_google_documents {
      google_document {
        document_id
      }
    }
  }
}`;

const findArticleByCategoryAndSlugQuery = `query AddonFindArticleByCategorySlug($category_id: Int!, $slug: String!, $document_id: String!, $locale_code: String) {
  articles(where: {category_id: {_eq: $category_id}, slug: {_eq: $slug}, article_google_documents: {google_document: {document_id: {_neq: $document_id}, locale_code: {_eq: $locale_code}}}}) {
    id
    slug
    category_id
    created_at
  }
}`;

const getArticleByGoogleDocQuery = `query AddonGetArticleByGoogleDoc($doc_id: String!) {
  articles(where: {article_google_documents: {google_document: {document_id: {_eq: $doc_id}}}}) {
    id
    slug
    canonical_url
    category {
      id
      slug
      title
    }
    author_articles {
      author {
        id
        first_names
        last_name
        slug
      }
    }
    article_google_documents(where: {google_document: {document_id: {_eq: $doc_id}}}) {
      google_document {
        document_id
        locale_code
        locale {
          code
          name
        }
        url
      }
    }
    article_sources {
      source {
        affiliation
        age
        created_at
        email
        ethnicity
        gender
        id
        name
        phone
        race
        role
        sexual_orientation
        updated_at
        zip
      }
    }
    tag_articles {
      tag_id
    }
  }
  authors {
    id
    slug
    first_names
    last_name
  }
  categories {
    id
    published
    slug
    category_translations(where: {locale_code: {_eq: "en-US"}}) {
      locale_code
      title
    }
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
    tag_translations(where: {locale_code: {_eq: "en-US"}}) {
      locale_code
      title
    }
  }
}`;

const getPageTranslationForIdAndLocale = `query AddonGetPageTranslationByLocaleAndID($doc_id: String!, $page_id: Int, $locale_code: String!) {
  page_translations(where: {page_id: {_eq: $page_id}, locale_code: {_eq: $locale_code}}, limit: 1, order_by: {id: desc}) {
    content
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

  pages(where: {page_google_documents: {google_document: {document_id: {_eq: $doc_id}}}}) {
    id
    slug
    author_pages {
      author {
        id
        first_names
        last_name
        slug
      }
    }
    page_google_documents(where: {google_document: {document_id: {_eq: $doc_id}}}) {
      google_document {
        document_id
        locale_code
        locale {
          code
          name
        }
        url
      }
    }
  }
  authors {
    id
    slug
    first_names
    last_name
  }
  page_google_documents(where: {page_id: {_eq: $page_id}}) {
    google_document {
      document_id
      locale_code
      locale {
        code
        name
      }
      url
    }
    page_id
  }
  organization_locales {
    locale {
      code
      name
    }
  }
}`;

const getArticleTranslationForIdAndLocale = `query AddonGetArticleTranslationByLocaleAndID($doc_id: String!, $article_id: Int, $locale_code: String!) {
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
        first_names
        last_name
        slug
      }
    }
    article_google_documents(where: {google_document: {document_id: {_eq: $doc_id}}}) {
      google_document {
        document_id
        locale_code
        locale {
          code
          name
        }
        url
      }
    }
    tag_articles {
      tag_id
    }
  }
  authors {
    id
    slug
    first_names
    last_name
  }
  categories {
    id
    published
    slug
    category_translations(where: {locale_code: {_eq: $locale_code}}) {
      locale_code
      title
    }
  }
  article_google_documents(where: {article_id: {_eq: $article_id}}) {
    google_document {
      document_id
      locale_code
      locale {
        code
        name
      }
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
    tag_translations {
      locale_code
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

const getPageForGoogleDocQuery = `query AddonGetPageForGoogleDoc($doc_id: String!) {
  pages(where: {page_google_documents: {google_document: {document_id: {_eq: $doc_id} }}}) {
    id
    slug
    page_google_documents(where: {google_document: {document_id: {_eq: $doc_id}}}) {
      google_document {
        document_id
        locale_code
        locale {
          code
          name
        }
        url
      }
    }
    author_pages {
      author {
        first_names
        last_name
        id
        slug
      }
    }
  }
  authors {
    id
    slug
    first_names
    last_name
  }
  organization_locales {
    locale {
      code
      name
    }
  }
}`;

const getOrganizationLocalesQuery = `query AddonGetOrganizationLocales {
  organization_locales {
    locale {
      code
      name
    }
  }
}`

const lookupArticleByGoogleDocQuery = `query AddonGetArticleByGoogleDoc($document_id: String) {
  article_google_documents(where: {google_document: {document_id: {_eq: $document_id}}}) {
    google_document {
      document_id
      locale_code
      locale {
        code
        name
      }
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

const searchArticlesByHeadlineQuery = `query AddonSearchArticlesByHeadline($locale_code: String!, $term: String!) {
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

const getHomepageFeaturedArticles = `query AddonGetHomepageFeaturedArticles {
  homepage_layout_datas {
    article_priority_1
    article_priority_2
    article_priority_3
  }
}`

const getPublishedArticles = `query AddonGetPublishedArticles($locale_code: String) {
  articles_aggregate(where: {article_translations: {locale_code: {_eq: $locale_code}, published: {_eq: true}}}) {
    aggregate {
      count
    }
  }
  articles(where: {article_translations: {locale_code: {_eq: $locale_code}, published: {_eq: true}}}, order_by: {article_translations_aggregate: {min: {first_published_at: desc}}}) {
    id
    slug
    article_google_documents {
      google_document {
        document_id
        url
        locale {
          code
          name
        }
      }
    }
    article_translations(where: {locale_code: {_eq: $locale_code}, published: {_eq: true}}, order_by: {id: desc}, limit: 1) {
      custom_byline
      first_published_at
      headline
      last_published_at
      main_image
      published
      search_description
      search_title
      twitter_description
      twitter_title
      facebook_description
      facebook_title
      updated_at
    }
    author_articles {
      author {
        first_names
        last_name
        photoUrl
        slug
        twitter
        author_translations(where: {locale_code: {_eq: $locale_code}}, order_by: {id: desc}, limit: 1) {
          bio
          title
        }
      }
    }
    category {
      id
      slug
      category_translations(where: {locale_code: {_eq: $locale_code}}) {
        locale_code
        title
      }
    }
  }
}`;


const deleteArticleMutation = `mutation AddonDeleteArticleMutation($article_id: Int!) {
  delete_homepage_layout_datas(where: {_or: {first_article: {id: {_eq: $article_id}}, third_article: {id: {_eq: $article_id}}, second_article: {id: {_eq: $article_id}}}}) {
    affected_rows
  }
  delete_published_article_translations(where: {article_id: {_eq: $article_id}}) {
    affected_rows
  }
  delete_article_translations(where: {article_id: {_eq: $article_id}}) {
    affected_rows
  }
  delete_article_slug_versions(where: {article_id: {_eq: $article_id}}) {
    affected_rows
  }
  delete_article_google_documents(where: {article_id: {_eq: $article_id}}) {
    affected_rows
  }
  delete_article_source(where: {article_id: {_eq: $article_id}}) {
    affected_rows
  }
  delete_author_articles(where: {article_id: {_eq: $article_id}}) {
    affected_rows
  }
  delete_tag_articles(where: {article_id: {_eq: $article_id}}) {
    affected_rows
  }
  delete_articles(where: {id: {_eq: $article_id}}) {
    affected_rows
  }
}`;


const deletePageBySlugMutation = `mutation AddonDeletePageBySlugMutation($slug: String!) {
  delete_page_translations(where: {page: {slug: {_eq: $slug}}}) {
    affected_rows
  }
  delete_page_slug_versions(where: {page: {slug: {_eq: $slug}}}) {
    affected_rows
  }
  delete_page_google_documents(where: {page: {slug: {_eq: $slug}}}) {
    affected_rows
  }
  delete_author_pages(where: {page: {slug: {_eq: $slug}}}) {
    affected_rows
  }
  delete_pages(where: {slug: {_eq: $slug}}) {
    affected_rows
  }
}`;

const deletePageMutation = `mutation AddonDeletePageMutation($page_id: Int!) {
  delete_page_translations(where: {page: {id: {_eq: $page_id}}}) {
    affected_rows
  }
  delete_page_slug_versions(where: {page: {id: {_eq: $page_id}}}) {
    affected_rows
  }
  delete_page_google_documents(where: {page: {id: {_eq: $page_id}}}) {
    affected_rows
  }
  delete_author_pages(where: {page: {id: {_eq: $page_id}}}) {
    affected_rows
  }
  delete_pages(where: {id: {_eq: $page_id}}) {
    affected_rows
  }
}`;