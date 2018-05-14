/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { NextEditorPart } from 'vs/workbench/browser/parts/editor2/nextEditorPart';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { GroupDirection, GroupsOrder } from 'vs/workbench/services/group/common/nextEditorGroupsService';
import { Dimension } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INextEditorPartOptions } from 'vs/workbench/browser/parts/editor2/editor2';
import { EditorInput, IFileEditorInput, IEditorInputFactory, IEditorInputFactoryRegistry, Extensions as EditorExtensions, EditorOptions } from 'vs/workbench/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import URI from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorRegistry, Extensions, EditorDescriptor } from 'vs/workbench/browser/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';

export class TestEditorControl extends BaseEditor {

	constructor(@ITelemetryService telemetryService: ITelemetryService) { super('MyFileEditorForNextEditorGroupService', NullTelemetryService, new TestThemeService()); }

	getId(): string { return 'myTestEditorForNextEditorGroupService'; }
	layout(): void { }
	createEditor(): any { }
}

export class TestEditorInput extends EditorInput implements IFileEditorInput {

	constructor(private resource: URI) { super(); }

	getTypeId() { return 'testEditorInputForNextEditorGroupService'; }
	resolve(): TPromise<IEditorModel> { return null; }
	matches(other: TestEditorInput): boolean { return other && this.resource.toString() === other.resource.toString() && other instanceof TestEditorInput; }
	setEncoding(encoding: string) { }
	getEncoding(): string { return null; }
	setPreferredEncoding(encoding: string) { }
	getResource(): URI { return this.resource; }
	setForceOpenAsBinary(): void { }
}

suite('Next editor2 part tests', () => {

	function registerTestEditorInput(): void {

		interface ISerializedTestEditorInput {
			resource: string;
		}

		class TestEditorInputFactory implements IEditorInputFactory {

			constructor() { }

			serialize(editorInput: EditorInput): string {
				const testEditorInput = <TestEditorInput>editorInput;
				const testInput: ISerializedTestEditorInput = {
					resource: testEditorInput.getResource().toString()
				};

				return JSON.stringify(testInput);
			}

			deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
				const testInput: ISerializedTestEditorInput = JSON.parse(serializedEditorInput);

				return new TestEditorInput(URI.parse(testInput.resource));
			}
		}

		(Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories)).registerEditorInputFactory('testEditorInputForGroupsService', TestEditorInputFactory);
		(Registry.as<IEditorRegistry>(Extensions.Editors)).registerEditor(new EditorDescriptor(TestEditorControl, 'MyTestEditorForGroupsService', 'My Test File Editor'), new SyncDescriptor(TestEditorInput));
	}

	registerTestEditorInput();

	function createPart(): NextEditorPart {
		const instantiationService = workbenchInstantiationService();

		const part = instantiationService.createInstance(NextEditorPart, 'id', false);
		part.create(document.createElement('div'));
		part.layout(new Dimension(400, 300));

		return part;
	}

	test('groups basics', function () {
		const part = createPart();

		let activeGroupChangeCounter = 0;
		const activeGroupChangeListener = part.onDidActiveGroupChange(() => {
			activeGroupChangeCounter++;
		});

		let groupAddedCounter = 0;
		const groupAddedListener = part.onDidAddGroup(() => {
			groupAddedCounter++;
		});

		let groupRemovedCounter = 0;
		const groupRemovedListener = part.onDidRemoveGroup(() => {
			groupRemovedCounter++;
		});

		let groupMovedCounter = 0;
		const groupMovedListener = part.onDidMoveGroup(() => {
			groupMovedCounter++;
		});

		let groupLabelChangeCounter = 0;
		const groupLabelChangeListener = part.onDidGroupLabelChange(() => {
			groupLabelChangeCounter++;
		});

		// always a root group
		const rootGroup = part.groups[0];
		assert.equal(part.groups.length, 1);
		assert.equal(part.count, 1);
		assert.equal(rootGroup, part.getGroup(rootGroup.id));
		assert.ok(part.activeGroup === rootGroup);
		assert.equal(groupLabelChangeCounter, 0);
		assert.equal(part.getLabel(rootGroup.id), 'Group 1');

		let mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.equal(mru.length, 1);
		assert.equal(mru[0], rootGroup);

		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		assert.equal(rightGroup, part.getGroup(rightGroup.id));
		assert.equal(groupAddedCounter, 1);
		assert.equal(part.groups.length, 2);
		assert.equal(part.count, 2);
		assert.ok(part.activeGroup === rootGroup);
		assert.equal(groupLabelChangeCounter, 1);
		assert.equal(part.getLabel(rootGroup.id), 'Group 1');
		assert.equal(part.getLabel(rightGroup.id), 'Group 2');

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.equal(mru.length, 2);
		assert.equal(mru[0], rootGroup);
		assert.equal(mru[1], rightGroup);

		assert.equal(activeGroupChangeCounter, 0);

		part.activateGroup(rightGroup);
		assert.ok(part.activeGroup === rightGroup);
		assert.equal(activeGroupChangeCounter, 1);

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.equal(mru.length, 2);
		assert.equal(mru[0], rightGroup);
		assert.equal(mru[1], rootGroup);

		const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
		let didDispose = false;
		downGroup.onWillDispose(() => {
			didDispose = true;
		});
		assert.equal(groupAddedCounter, 2);
		assert.equal(part.groups.length, 3);
		assert.ok(part.activeGroup === rightGroup);
		assert.ok(!downGroup.activeControl);
		assert.equal(groupLabelChangeCounter, 2);
		assert.equal(part.getLabel(rootGroup.id), 'Group 1');
		assert.equal(part.getLabel(rightGroup.id), 'Group 2');
		assert.equal(part.getLabel(downGroup.id), 'Group 3');

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.equal(mru.length, 3);
		assert.equal(mru[0], rightGroup);
		assert.equal(mru[1], rootGroup);
		assert.equal(mru[2], downGroup);

		const gridOrder = part.getGroups(GroupsOrder.GRID_ORDER);
		assert.equal(gridOrder.length, 3);
		assert.equal(gridOrder[0], rootGroup);
		assert.equal(gridOrder[1], rightGroup);
		assert.equal(gridOrder[2], downGroup);

		part.moveGroup(downGroup, rightGroup, GroupDirection.DOWN);
		assert.equal(groupMovedCounter, 1);

		part.removeGroup(downGroup);
		assert.ok(!part.getGroup(downGroup.id));
		assert.equal(didDispose, true);
		assert.equal(groupRemovedCounter, 1);
		assert.equal(part.groups.length, 2);
		assert.ok(part.activeGroup === rightGroup);

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.equal(mru.length, 2);
		assert.equal(mru[0], rightGroup);
		assert.equal(mru[1], rootGroup);

		let rightGroupInstantiator: IInstantiationService;
		part.activeGroup.invokeWithinContext(accessor => {
			rightGroupInstantiator = accessor.get(IInstantiationService);
		});

		let rootGroupInstantiator: IInstantiationService;
		rootGroup.invokeWithinContext(accessor => {
			rootGroupInstantiator = accessor.get(IInstantiationService);
		});

		assert.ok(rightGroupInstantiator);
		assert.ok(rootGroupInstantiator);
		assert.ok(rightGroupInstantiator !== rootGroupInstantiator);

		part.removeGroup(rightGroup);
		assert.equal(groupRemovedCounter, 2);
		assert.equal(part.groups.length, 1);
		assert.ok(part.activeGroup === rootGroup);

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.equal(mru.length, 1);
		assert.equal(mru[0], rootGroup);

		part.removeGroup(rootGroup); // cannot remove root group
		assert.equal(part.groups.length, 1);
		assert.equal(groupRemovedCounter, 2);
		assert.ok(part.activeGroup === rootGroup);

		activeGroupChangeListener.dispose();
		groupAddedListener.dispose();
		groupRemovedListener.dispose();
		groupMovedListener.dispose();
		groupLabelChangeListener.dispose();

		part.dispose();
	});

	test('whenRestored', function () {
		const part = createPart();

		return part.whenRestored.then(() => {
			assert.ok(true);
			part.dispose();
		});
	});

	test('options', function () {
		const part = createPart();

		let oldOptions: INextEditorPartOptions;
		let newOptions: INextEditorPartOptions;
		part.onDidEditorPartOptionsChange(event => {
			oldOptions = event.oldPartOptions;
			newOptions = event.newPartOptions;
		});

		const currentOptions = part.partOptions;
		assert.ok(currentOptions);

		part.enforcePartOptions({ showTabs: false });
		assert.equal(part.partOptions.showTabs, false);
		assert.equal(newOptions.showTabs, false);
		assert.equal(oldOptions, currentOptions);

		part.dispose();
	});

	test('editor basics', function () {
		const part = createPart();
		const group = part.activeGroup;

		let activeEditorChangeCounter = 0;
		const activeEditorChangeListener = group.onDidActiveEditorChange(() => {
			activeEditorChangeCounter++;
		});

		let editorCloseCounter = 0;
		const editorCloseListener = group.onDidCloseEditor(() => {
			editorCloseCounter++;
		});

		const input = new TestEditorInput(URI.file('foo/bar'));
		const inputInactive = new TestEditorInput(URI.file('foo/bar/inactive'));

		return group.openEditor(input, EditorOptions.create({ pinned: true })).then(() => {
			return group.openEditor(inputInactive, EditorOptions.create({ inactive: true })).then(() => {
				assert.equal(group.count, 2);
				assert.equal(activeEditorChangeCounter, 1);

				assert.equal(group.activeEditor, input);
				assert.ok(group.activeControl instanceof TestEditorControl);
				assert.equal(group.editors.length, 2);

				return group.openEditor(inputInactive).then(() => {
					assert.equal(activeEditorChangeCounter, 2);
					assert.equal(group.activeEditor, inputInactive);

					return group.closeEditor(inputInactive).then(() => {
						assert.equal(activeEditorChangeCounter, 3);
						assert.equal(editorCloseCounter, 1);

						assert.equal(group.activeEditor, input);

						activeEditorChangeListener.dispose();
						editorCloseListener.dispose();
						part.dispose();
					});
				});
			});
		});
	});
});