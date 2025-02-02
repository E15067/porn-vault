import { labelCollection } from "../../database";
import { buildLabelExtractor } from "../../extractor";
import { indexActors } from "../../search/actor";
import { indexImages } from "../../search/image";
import { indexScenes } from "../../search/scene";
import { indexStudios } from "../../search/studio";
import Actor from "../../types/actor";
import Image from "../../types/image";
import Label from "../../types/label";
import LabelledItem from "../../types/labelled_item";
import Scene from "../../types/scene";
import Studio from "../../types/studio";
import * as logger from "../../utils/logger";
import { filterInvalidAliases } from "../../utils/misc";
import { isHexColor } from "../../utils/string";

type ILabelUpdateOpts = Partial<{
  name: string;
  aliases: string[];
  thumbnail: string;
  color: string;
}>;

export default {
  async removeLabel(_: unknown, { item, label }: { item: string; label: string }): Promise<true> {
    await LabelledItem.remove(item, label);

    if (item.startsWith("sc_")) {
      const scene = await Scene.getById(item);
      if (scene) {
        await indexScenes([scene]);
      }
    } else if (item.startsWith("im_")) {
      const image = await Image.getById(item);
      if (image) {
        await indexImages([image]);
      }
    } else if (item.startsWith("st_")) {
      const studio = await Studio.getById(item);
      if (studio) {
        await indexStudios([studio]);
      }
    } else if (item.startsWith("ac_")) {
      const actor = await Actor.getById(item);
      if (actor) {
        await indexActors([actor]);
      }
    }

    return true;
  },
  async removeLabels(_: unknown, { ids }: { ids: string[] }): Promise<boolean> {
    for (const id of ids) {
      const label = await Label.getById(id);

      if (label) {
        await Label.remove(label._id);
        await LabelledItem.removeByLabel(id);
      }
    }
    return true;
  },

  async addLabel(_: unknown, args: { name: string; aliases?: string[] }): Promise<Label> {
    const aliases = filterInvalidAliases(args.aliases || []);
    const label = new Label(args.name, aliases);

    const localExtractLabels = await buildLabelExtractor([label]);
    // TODO: don't use scene.getAll, use search instead
    for (const scene of await Scene.getAll()) {
      if (localExtractLabels(scene.path || scene.name).includes(label._id)) {
        const labels = (await Scene.getLabels(scene)).map((l) => l._id);
        labels.push(label._id);
        await Scene.setLabels(scene, labels);
        await indexScenes([scene]);
        logger.log(`Updated labels of ${scene._id}.`);
      }
    }

    /* for (const image of await Image.getAll()) {
      if (isBlacklisted(image.name)) continue;

      if (isMatchingItem(image.path || image.name, label, false)) {
        const labels = (await Image.getLabels(image)).map((l) => l._id);
        labels.push(label._id);
        await Image.setLabels(image, labels);
        await indexImages([image]);
        logger.log(`Updated labels of ${image._id}.`);
      } 
    } */

    await labelCollection.upsert(label._id, label);
    return label;
  },

  async updateLabels(
    _: unknown,
    { ids, opts }: { ids: string[]; opts: ILabelUpdateOpts }
  ): Promise<Label[]> {
    const updatedLabels = [] as Label[];

    for (const id of ids) {
      const label = await Label.getById(id);

      if (label) {
        if (Array.isArray(opts.aliases)) {
          label.aliases = [...new Set(filterInvalidAliases(opts.aliases))];
        }

        if (opts.name) {
          label.name = opts.name.trim();
        }

        if (opts.thumbnail) {
          label.thumbnail = opts.thumbnail;
        }

        if (opts.color && isHexColor(opts.color)) {
          label.color = opts.color;
        } else if (opts.color === "") {
          label.color = null;
        }

        await labelCollection.upsert(label._id, label);
        updatedLabels.push(label);
      } else {
        throw new Error(`Label ${id} not found`);
      }
    }

    return updatedLabels;
  },
};
