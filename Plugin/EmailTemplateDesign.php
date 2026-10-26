<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Plugin;

use Magento\Email\Model\Template;
use OOCS\LynxTheme\Helper\EmailDesign;

/**
 * Marks the span an email template renders in, design emulation included
 */
class EmailTemplateDesign
{
    /**
     * Email design
     *
     * @param EmailDesign $emailDesign
     */
    public function __construct(
        private readonly EmailDesign $emailDesign,
    ) {
    }

    /**
     * Before Process Template: it applies the design before loading the template file
     *
     * @param Template $subject
     * @return null
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeProcessTemplate(Template $subject)
    {
        $this->emailDesign->enter();

        return null;
    }

    /**
     * After Process Template
     *
     * @param Template $subject
     * @param string $result
     * @return string
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterProcessTemplate(Template $subject, $result)
    {
        $this->emailDesign->leave();

        return $result;
    }

    /**
     * Before Get Processed Template: called on its own by senders that skip processTemplate()
     *
     * @param Template $subject
     * @param array $variables
     * @return null
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeGetProcessedTemplate(Template $subject, array $variables = [])
    {
        $this->emailDesign->enter();

        return null;
    }

    /**
     * After Get Processed Template
     *
     * @param Template $subject
     * @param string $result
     * @return string
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterGetProcessedTemplate(Template $subject, $result)
    {
        $this->emailDesign->leave();

        return $result;
    }
}
