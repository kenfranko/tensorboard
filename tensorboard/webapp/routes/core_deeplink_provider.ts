/* Copyright 2020 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
import {Injectable} from '@angular/core';
import {Store} from '@ngrx/store';
import {DeepLinkProvider} from '../app_routing/deep_link_provider';
import {SerializableQueryParams} from '../app_routing/types';
import {
  CardInStorage,
  URLDeserializedState as MetricsURLDeserializedState,
} from '../metrics/types';
import {isSampledPlugin, isSingleRunPlugin} from '../metrics/data_source/types';
import {combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';

import {State} from '../app_state';
import * as selectors from '../selectors';

export type DeserializedState = MetricsURLDeserializedState;

/**
 * Provides deeplinking for the core dashboards page.
 */
@Injectable()
export class CoreDeepLinkProvider extends DeepLinkProvider {
  private getMetricsPinnedCards(
    store: Store<State>
  ): Observable<SerializableQueryParams> {
    return combineLatest([
      store.select(selectors.getPinnedCardsWithMetadata),
      store.select(selectors.getPrePinnedCards),
    ]).pipe(
      map(([pinnedCards, prePinnedCards]) => {
        if (!pinnedCards.length && !prePinnedCards.length) {
          return [];
        }

        const pinnedCardsToStore = pinnedCards.map(
          ({plugin, tag, sample, runId}) => {
            const info = {tag} as CardInStorage;
            if (isSingleRunPlugin(plugin)) {
              info.runId = runId!;
            }
            if (isSampledPlugin(plugin)) {
              info.sample = sample!;
            }
            return info;
          }
        );
        // Intentionally order pre-pinned cards last, so that cards
        // pinned by the user in this session have priority.
        const cardsToStore = [...pinnedCardsToStore, ...prePinnedCards];
        return [{key: 'pinnedCards', value: JSON.stringify(cardsToStore)}];
      })
    );
  }

  serializeStateToQueryParams(
    store: Store<State>
  ): Observable<SerializableQueryParams> {
    return this.getMetricsPinnedCards(store);
  }

  deserializeQueryParams(
    queryParams: SerializableQueryParams
  ): DeserializedState {
    let pinnedCards = null;
    for (const {key, value} of queryParams) {
      if (key === 'pinnedCards') {
        pinnedCards = pinnedCards || extractPinnedCardsFromURLText(value);
      }
    }
    return {
      metrics: {
        pinnedCards: pinnedCards || [],
      },
    };
  }
}

function extractPinnedCardsFromURLText(
  urlText: string
): CardInStorage[] | null {
  // Check that the URL text parses.
  let object;
  try {
    object = JSON.parse(urlText) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(object)) {
    return null;
  }

  const result = [];
  for (const item of object) {
    // Validate types.
    const isRunString = typeof item.runId === 'string';
    const isSampleNumber = typeof item.sample === 'number';
    const isTagTypeValid = typeof item.tag === 'string';
    const isRunTypeValid = isRunString || typeof item.runId === 'undefined';
    const isSampleTypeValid =
      isSampleNumber || typeof item.sample === 'undefined';
    if (!isTagTypeValid || !isRunTypeValid || !isSampleTypeValid) {
      continue;
    }

    // Required fields and range errors.
    if (!item.tag) {
      continue;
    }
    if (isRunString && !item.runId) {
      continue;
    }
    if (
      typeof item.sample === 'number' &&
      !(Number.isInteger(item.sample) && item.sample >= 0)
    ) {
      continue;
    }

    // Assemble result.
    const resultItem = {tag: item.tag} as CardInStorage;
    if (isRunString) {
      resultItem.runId = item.runId;
    }
    if (isSampleNumber) {
      resultItem.sample = item.sample;
    }
    result.push(resultItem);
  }
  return result;
}
