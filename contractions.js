(() => {
  "use strict";
  // Teacher-facing full forms, not family labels or corpus coverage assignments.
  // Scope: the existing 36-form registry, six original forms and final 18 forms.
  const forms = {
    "don't": "do not", "doesn't": "does not", "didn't": "did not",
    "i'm": "I am", "let's": "let us", "i've": "I have",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not",
    "weren't": "were not", "haven't": "have not", "hasn't": "has not",
    "hadn't": "had not", "can't": "cannot", "cannot": "can not",
    "couldn't": "could not", "won't": "will not", "wouldn't": "would not",
    "shouldn't": "should not", "mustn't": "must not", "needn't": "need not",
    "you're": "you are", "we're": "we are", "they're": "they are",
    "you've": "you have", "we've": "we have", "they've": "they have",
    "i'll": "I will", "you'll": "you will", "he'll": "he will",
    "she'll": "she will", "it'll": "it will", "we'll": "we will", "they'll": "they will",
    "that's": "that is / that has", "there's": "there is / there has",
    "here's": "here is", "what's": "what is / what has", "who's": "who is / who has",
    "he's": "he is / he has", "she's": "she is / she has", "it's": "it is / it has",
    "i'd": "I had / I would", "he'd": "he had / he would", "there're": "there are",
    "would've": "would have", "where's": "where is / where has", "could've": "could have",
    "how's": "how is / how has", "there'll": "there will", "that'll": "that will",
    "who're": "who are", "who'll": "who will", "should've": "should have",
    "must've": "must have", "when's": "when is / when has", "mightn't": "might not",
    "oughtn't": "ought not", "what're": "what are", "where're": "where are"
  };
  globalThis.HKELE_CONTRACTION_DESCRIPTIONS = Object.freeze(forms);
})();
