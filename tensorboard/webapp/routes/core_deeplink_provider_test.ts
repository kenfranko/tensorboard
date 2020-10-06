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
import {TestBed} from '@angular/core/testing';
import {Store} from '@ngrx/store';
import {MockStore, provideMockStore} from '@ngrx/store/testing';
import {Observable} from 'rxjs';
import {skip} from 'rxjs/operators';

import * as selectors from '../selectors';
import {DeepLinkProvider} from '../app_routing/deep_link_provider';
import {SerializableQueryParams} from '../app_routing/types';
import {State} from '../app_state';
import {appStateFromMetricsState, buildMetricsState} from '../metrics/testing';
import {PluginType} from '../metrics/data_source/types';
import {CoreDeepLinkProvider} from './core_deeplink_provider';

describe('core deeplink provider', () => {
  let store: MockStore<State>;
  let provider: DeepLinkProvider;
  let queryParamsSerialized: SerializableQueryParams[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideMockStore({
          initialState: {
            ...appStateFromMetricsState(buildMetricsState()),
          },
        }),
      ],
    }).compileComponents();

    store = TestBed.inject<Store<State>>(Store) as MockStore<State>;
    queryParamsSerialized = [];

    provider = new CoreDeepLinkProvider();
    provider
      .serializeStateToQueryParams(store)
      .pipe(
        // Skip the initial bootstrap.
        skip(1)
      )
      .subscribe((queryParams) => {
        queryParamsSerialized.push(queryParams);
      });
  });

  describe('time series', () => {
    it('serializes pinned card state when store updates', () => {
      store.overrideSelector(selectors.getPinnedCardsWithMetadata, [
        {
          cardId: 'card1',
          plugin: PluginType.SCALARS,
          tag: 'accuracy',
          runId: null,
        },
      ]);
      store.overrideSelector(selectors.getPrePinnedCards, [
        {
          tag: 'loss',
        },
      ]);
      store.refreshState();

      expect(queryParamsSerialized[queryParamsSerialized.length - 1]).toEqual([
        {
          key: 'pinnedCards',
          value: '[{"tag":"accuracy"},{"tag":"loss"}]',
        },
      ]);

      store.overrideSelector(selectors.getPinnedCardsWithMetadata, [
        {
          cardId: 'card1',
          plugin: PluginType.SCALARS,
          tag: 'accuracy2',
          runId: null,
        },
      ]);
      store.overrideSelector(selectors.getPrePinnedCards, [
        {
          tag: 'loss2',
        },
      ]);
      store.refreshState();

      expect(queryParamsSerialized[queryParamsSerialized.length - 1]).toEqual([
        {
          key: 'pinnedCards',
          value: '[{"tag":"accuracy2"},{"tag":"loss2"}]',
        },
      ]);
    });

    it('serializes nothing when states are empty', () => {
      store.overrideSelector(selectors.getPinnedCardsWithMetadata, []);
      store.overrideSelector(selectors.getPrePinnedCards, []);
      store.refreshState();

      expect(queryParamsSerialized[queryParamsSerialized.length - 1]).toEqual(
        []
      );
    });

    it('deserializes empty pinned cards', () => {
      const state = provider.deserializeQueryParams([]);

      expect(state).toEqual({metrics: {pinnedCards: []}});
    });

    it('deserializes valid pinned cards', () => {
      const state = provider.deserializeQueryParams([
        {
          key: 'pinnedCards',
          value:
            '[{"tag":"accuracy"},{"tag":"loss","runId":"exp1/123","sample":5}]',
        },
      ]);

      expect(state).toEqual({
        metrics: {
          pinnedCards: [
            {tag: 'accuracy'},
            {tag: 'loss', runId: 'exp1/123', sample: 5},
          ],
        },
      });
    });

    it('sanitizes pinned cards on deserialization', () => {
      const cases = [
        {
          serializedValue: 'blah[{"tag":"accuracy"}]',
          expectedPinnedCards: [],
        },
        {
          serializedValue: '[{"tag":5},{"tag":"foo"}]',
          expectedPinnedCards: [{tag: 'foo'}],
        },
        {
          serializedValue: '[{"tag":"loss","runId":123},{"tag":"foo"}]',
          expectedPinnedCards: [{tag: 'foo'}],
        },
        {
          serializedValue: '[{"tag":"loss","runId":""},{"tag":"foo"}]',
          expectedPinnedCards: [{tag: 'foo'}],
        },
        {
          serializedValue: '[{"tag":"loss","sample":"5"},{"tag":"foo"}]',
          expectedPinnedCards: [{tag: 'foo'}],
        },
        {
          serializedValue: '[{"tag":"loss","sample":5.5},{"tag":"foo"}]',
          expectedPinnedCards: [{tag: 'foo'}],
        },
        {
          serializedValue: '[{"tag":"loss","sample":-5},{"tag":"foo"}]',
          expectedPinnedCards: [{tag: 'foo'}],
        },
      ];
      for (const {serializedValue, expectedPinnedCards} of cases) {
        const state = provider.deserializeQueryParams([
          {key: 'pinnedCards', value: serializedValue},
        ]);

        expect(state).toEqual({metrics: {pinnedCards: expectedPinnedCards}});
      }
    });
  });
});
