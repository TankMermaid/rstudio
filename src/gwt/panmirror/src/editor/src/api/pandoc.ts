/*
 * pandoc.ts
 *
 * Copyright (C) 2019-20 by RStudio, Inc.
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { Fragment, Mark, Node as ProsemirrorNode, Schema, NodeType } from 'prosemirror-model';

export interface PandocEngine {
  markdownToAst(markdown: string, format: string, options: string[]): Promise<PandocAst>;
  astToMarkdown(ast: PandocAst, format: string, options: string[]): Promise<string>;
  listExtensions(format: string): Promise<string>;
}

export interface PandocFormat {
  baseName: string;
  fullName: string;
  extensions: PandocExtensions;
  warnings: PandocFormatWarnings;
}

export interface PandocFormatWarnings {
  invalidFormat: string;
  invalidOptions: string[];
}

export async function pandocFormat(pandoc: PandocEngine, format: string) {
  // setup warnings
  let warnings: PandocFormatWarnings = { invalidFormat: '', invalidOptions: [] };

  // split out base format from options
  let optionsPos = format.indexOf('-');
  if (optionsPos === -1) {
    optionsPos = format.indexOf('+');
  }
  const split = splitFormat(format);
  let baseName = split.format;
  let options = split.options;

  // validate the base format (fall back to markdown if it's not known)
  if (
    ![
      'markdown',
      'markdown_phpextra',
      'markdown_github',
      'markdown_mmd',
      'markdown_strict',
      'gfm',
      'commonmark',
    ].includes(baseName)
  ) {
    warnings.invalidFormat = baseName;
    baseName = 'markdown';
  }

  // format options we will be building
  let formatOptions: string;

  // if the base format is commonmark or gfm then it's expressed as a set of
  // deltas on top of markdown
  let validOptions: string = '';
  if (['gfm', 'commonmark'].includes(baseName)) {
    // query for available options then disable them all by default
    formatOptions = await pandoc.listExtensions('markdown');
    formatOptions = formatOptions.replace(/\+/g, '-');

    // layer on gfm or commonmark
    let extraOptions = (validOptions = await pandoc.listExtensions(baseName));
    formatOptions = formatOptions + extraOptions;
  } else {
    // query for format options
    formatOptions = validOptions = await pandoc.listExtensions(baseName);
  }

  // active pandoc extensions
  const pandocExtensions: { [key: string]: boolean } = {};

  // first parse extensions for format
  parseExtensions(formatOptions).forEach(option => {
    pandocExtensions[option.name] = option.enabled;
  });

  // now parse extensions for user options (validate and build format name)
  let validOptionNames = parseExtensions(validOptions).map(option => option.name);
  let fullName = baseName;
  parseExtensions(options).forEach(option => {
    // validate that the option is valid
    if (validOptionNames.includes(option.name)) {
      // add option
      fullName += (option.enabled ? '+' : '-') + option.name;
      pandocExtensions[option.name] = option.enabled;
    } else {
      warnings.invalidOptions.push(option.name);
    }
  });

  // return format name, enabled extensiosn, and warnings
  return {
    baseName,
    fullName,
    extensions: (pandocExtensions as unknown) as PandocExtensions,
    warnings,
  };
}

function parseExtensions(options: string) {
  // remove any linebreaks
  options = options.split('\n').join();

  // parse into separate entries
  const extensions: Array<{ name: string; enabled: boolean }> = [];
  const re = /([+-])([a-z_]+)/g;
  let match = re.exec(options);
  while (match) {
    extensions.push({ name: match[2], enabled: match[1] === '+' });
    match = re.exec(options);
  }

  return extensions;
}

export interface PandocExtensions {
  abbreviations: boolean;
  all_symbols_escapable: boolean;
  amuse: boolean;
  angle_brackets_escapable: boolean;
  ascii_identifiers: boolean;
  auto_identifiers: boolean;
  autolink_bare_uris: boolean;
  backtick_code_blocks: boolean;
  blank_before_blockquote: boolean;
  blank_before_header: boolean;
  bracketed_spans: boolean;
  citations: boolean;
  compact_definition_lists: boolean;
  definition_lists: boolean;
  east_asian_line_breaks: boolean;
  emoji: boolean;
  empty_paragraphs: boolean;
  epub_html_exts: boolean;
  escaped_line_breaks: boolean;
  example_lists: boolean;
  fancy_lists: boolean;
  fenced_code_attributes: boolean;
  fenced_code_blocks: boolean;
  fenced_divs: boolean;
  footnotes: boolean;
  four_space_rule: boolean;
  gfm_auto_identifiers: boolean;
  grid_tables: boolean;
  hard_line_breaks: boolean;
  header_attributes: boolean;
  ignore_line_breaks: boolean;
  implicit_figures: boolean;
  implicit_header_references: boolean;
  inline_code_attributes: boolean;
  inline_notes: boolean;
  intraword_underscores: boolean;
  latex_macros: boolean;
  line_blocks: boolean;
  link_attributes: boolean;
  lists_without_preceding_blankline: boolean;
  literate_haskell: boolean;
  markdown_attribute: boolean;
  markdown_in_html_blocks: boolean;
  mmd_header_identifiers: boolean;
  mmd_link_attributes: boolean;
  mmd_title_block: boolean;
  multiline_tables: boolean;
  native_divs: boolean;
  native_spans: boolean;
  native_numbering: boolean;
  ntb: boolean;
  old_dashes: boolean;
  pandoc_title_block: boolean;
  pipe_tables: boolean;
  raw_attribute: boolean;
  raw_html: boolean;
  raw_tex: boolean;
  shortcut_reference_links: boolean;
  simple_tables: boolean;
  smart: boolean;
  space_in_atx_header: boolean;
  spaced_reference_links: boolean;
  startnum: boolean;
  strikeout: boolean;
  subscript: boolean;
  superscript: boolean;
  styles: boolean;
  task_lists: boolean;
  table_captions: boolean;
  tex_math_dollars: boolean;
  tex_math_double_backslash: boolean;
  tex_math_single_backslash: boolean;
  yaml_metadata_block: boolean;
  gutenberg: boolean;
  [key: string]: boolean;
}

export function pandocFormatWith(format: string, prepend: string, append: string) {
  const split = splitFormat(format);
  return `${split.format}${prepend}${split.options}${append}`;
}

export interface PandocAst {
  blocks: PandocToken[];
  'pandoc-api-version': PandocApiVersion;
  meta: any;
}

export type PandocApiVersion = [number, number, number, number];

export interface PandocToken {
  t: string;
  c?: any;
}

export enum PandocTokenType {
  Str = 'Str',
  Space = 'Space',
  Strong = 'Strong',
  Emph = 'Emph',
  Code = 'Code',
  Superscript = 'Superscript',
  Subscript = 'Subscript',
  Strikeout = 'Strikeout',
  SmallCaps = 'SmallCaps',
  Quoted = 'Quoted',
  RawInline = 'RawInline',
  RawBlock = 'RawBlock',
  LineBlock = 'LineBlock',
  Para = 'Para',
  Plain = 'Plain',
  Header = 'Header',
  CodeBlock = 'CodeBlock',
  BlockQuote = 'BlockQuote',
  BulletList = 'BulletList',
  OrderedList = 'OrderedList',
  DefinitionList = 'DefinitionList',
  Image = 'Image',
  Link = 'Link',
  Note = 'Note',
  Cite = 'Cite',
  Table = 'Table',
  AlignRight = 'AlignRight',
  AlignLeft = 'AlignLeft',
  AlignDefault = 'AlignDefault',
  AlignCenter = 'AlignCenter',
  HorizontalRule = 'HorizontalRule',
  LineBreak = 'LineBreak',
  SoftBreak = 'SoftBreak',
  Math = 'Math',
  InlineMath = 'InlineMath',
  DisplayMath = 'DisplayMath',
  Div = 'Div',
  Span = 'Span',
  Null = 'Null',
}

export interface PandocTokenReader {
  // pandoc token name (e.g. "Str", "Emph", etc.)
  readonly token: PandocTokenType;

  // one and only one of these values must also be set
  readonly text?: boolean;
  readonly node?: string;
  readonly block?: string;
  readonly mark?: string;

  readonly code_block?: boolean;

  // functions for getting attributes and children
  getAttrs?: (tok: PandocToken) => any;
  getChildren?: (tok: PandocToken) => any[];
  getText?: (tok: PandocToken) => string;

  // lower-level handler function that overrides the above handler attributes
  // (they are ignored when handler is speciried)
  handler?: (schema: Schema) => (writer: ProsemirrorWriter, tok: PandocToken) => void;

  // post-processor for performing fixups that rely on seeing the entire
  // document (e.g. recognizing implicit header references)
  postprocessor?: PandocPostprocessorFn;
}

// special reader that gets a first shot at blocks (i.e. to convert a para w/ a single image into a figure)
export type PandocBlockReaderFn = (schema: Schema, tok: PandocToken, writer: ProsemirrorWriter) => boolean;

// reader for code blocks that require special handling
export interface PandocCodeBlockFilter {
  preprocessor: (markdown: string) => string;
  class: string;
  nodeType: (schema: Schema) => NodeType;
  getAttrs: (tok: PandocToken) => any;
}

export interface ProsemirrorWriter {
  // open (then close) a node container
  openNode(type: NodeType, attrs: {}): void;
  closeNode(): ProsemirrorNode;

  // special open call for note node containers
  openNoteNode(ref: string): void;

  // add a node to the current container
  addNode(type: NodeType, attrs: {}, content: ProsemirrorNode[]): ProsemirrorNode | null;

  // open and close marks
  openMark(mark: Mark): void;
  closeMark(mark: Mark): void;

  // add text to the current node using the current mark set
  writeText(text: string): void;

  // write tokens into the current node
  writeTokens(tokens: PandocToken[]): void;
}

export interface PandocNodeWriter {
  readonly name: string;
  readonly write: PandocNodeWriterFn;
}

export type PandocNodeWriterFn = (output: PandocOutput, node: ProsemirrorNode) => void;

export type PandocPreprocessorFn = (markdown: string) => string;

export type PandocPostprocessorFn = (doc: ProsemirrorNode) => ProsemirrorNode;

export interface PandocMarkWriter {
  // pandoc mark name
  readonly name: string;

  // The 'priority' property allows us to dicate the order of nesting
  // for marks (this is required b/c Prosemirror uses a flat structure
  // whereby multiple marks are attached to text nodes). This allows us
  // to e.g. ensure that strong and em always occur outside code.
  readonly priority: number;

  // writer function
  readonly write: PandocMarkWriterFn;
}

export type PandocMarkWriterFn = (output: PandocOutput, mark: Mark, parent: Fragment) => void;

export type PandocOutputOption = 'writeSpaces';

export interface PandocOutput {
  write(value: any): void;
  writeToken(type: PandocTokenType, content?: (() => void) | any): void;
  writeMark(type: PandocTokenType, parent: Fragment, expelEnclosingWhitespace?: boolean): void;
  writeArray(content: () => void): void;
  writeAttr(id?: string, classes?: string[], keyvalue?: string[]): void;
  writeText(text: string | null): void;
  writeNode(node: ProsemirrorNode): void;
  writeNodes(parent: ProsemirrorNode): void;
  writeNote(note: ProsemirrorNode): void;
  writeInlines(fragment: Fragment): void;
  writeRawMarkdown(markdown: Fragment | string): void;
  withOption(option: PandocOutputOption, value: boolean, f: () => void): void;
}

export type PandocAstOutputFilter = (ast: PandocAst, util: PandocAstOutputFilterUtil) => Promise<PandocAst>;

export interface PandocAstOutputFilterUtil {
  markdownToAst(markdown: string): Promise<PandocAst>;
  astToMarkdown(ast: PandocAst, format_options: string): Promise<string>;
}

export type PandocMarkdownOutputFilter = (markdown: string) => string;

// collect the text from a collection of pandoc ast
// elements (ignores marks, useful for ast elements
// that support marks but whose prosemirror equivalent
// does not, e.g. image alt text)
export function tokensCollectText(c: PandocToken[]): string {
  return c
    .map(elem => {
      if (elem.t === 'Str') {
        return elem.c;
      } else if (elem.t === 'Space') {
        return ' ';
      } else if (elem.c) {
        return tokensCollectText(elem.c);
      } else {
        return '';
      }
    })
    .join('');
}

export function forEachToken(tokens: PandocToken[], f: (tok: PandocToken) => void) {
  mapTokens(tokens, (tok: PandocToken) => {
    f(tok);
    return tok;
  });
}

export function mapTokens(tokens: PandocToken[], f: (tok: PandocToken) => PandocToken) {
  function isToken(val: any) {
    if (val !== null && typeof val === 'object') {
      return val.hasOwnProperty('t');
    } else {
      return false;
    }
  }

  function tokenHasChildren(tok: PandocToken) {
    return tok !== null && typeof tok === 'object' && Array.isArray(tok.c);
  }

  function mapValue(val: any): any {
    if (isToken(val)) {
      return mapToken(val);
    } else if (Array.isArray(val)) {
      return val.map(mapValue);
    } else {
      return val;
    }
  }

  function mapToken(tok: PandocToken): PandocToken {
    const mappedTok = f(tok);
    if (tokenHasChildren(mappedTok)) {
      mappedTok.c = mappedTok.c.map(mapValue);
    }
    return mappedTok;
  }

  return tokens.map(mapToken);
}

function splitFormat(format: string) {
  // split out base format from options
  let optionsPos = format.indexOf('-');
  if (optionsPos === -1) {
    optionsPos = format.indexOf('+');
  }
  const base = optionsPos === -1 ? format : format.substr(0, optionsPos);
  const options = optionsPos === -1 ? '' : format.substr(optionsPos);
  return {
    format: base,
    options,
  };
}
